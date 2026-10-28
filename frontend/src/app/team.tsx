// Team & roles: everyone on the team grouped by role (highest first), and invites by email.
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { showSheet } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Gate } from '@/features/rbac/components/Gate';
import { RoleBadge } from '@/features/rbac/components/RoleBadge';
import { addSuperAdmin, clearInvites, createInvite, fetchCatalog, fetchInvites, fetchMembers, fetchSuperAdmins, removeSuperAdmin, revokeInvite } from '@/features/rbac/api';
import { ADMIN_RANK, roleColor, useAccess, useCan } from '@/features/rbac/store';
import { colors, radius } from '@/theme';
import type { Catalog, Invite, Member, RoleDef, SuperAdminEntry } from '@/types';
import { formatPhone } from '@/utils/phone';
import { timeAgo } from '@/utils/time';

type Tab = 'people' | 'invites';

function TeamScreen() {
  const [tab, setTab] = useState<Tab>('people');
  const canAdmins = useCan('admins.manage');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const changes = useAccess((s) => s.changes);
  const me = useAccess((s) => s.humanId);
  const roleLabel = useAccess((s) => s.roleLabel);
  const canEditRoles = useCan('roles.manage');
  const canInvite = useCan('team.invite');
  const canAudit = useCan('audit.view');

  const load = useCallback(async () => {
    try {
      const [m, c, i] = await Promise.all([fetchMembers(), fetchCatalog(), fetchInvites().catch(() => [] as Invite[])]);
      setMembers(m);
      setCatalog(c);
      setInvites(i);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (changes) void load();
  }, [changes, load]);

  if (!members && !error) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  const roleOrder = catalog?.roles ?? [];
  const groups = roleOrder.map((r) => ({ role: r, people: (members ?? []).filter((m) => m.human.role === r.id) })).filter((g) => g.people.length);
  const active = (members ?? []).filter((m) => m.human.accountState === 'active').length;
  const suspended = (members ?? []).length - active;
  const pending = invites.filter((i) => i.status === 'pending').length;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await load(), setRefreshing(false))} />}
    >
      {!me ? (
        <Pressable onPress={() => router.push('/preferences/profile')} style={({ pressed }) => [styles.setup, pressed && styles.pressed]}>
          <Ionicons name="person-add" size={20} color={colors.warning} />
          <View style={styles.flex}>
            <Text style={styles.setupTitle}>Set up your team profile</Text>
            <Text style={styles.setupText}>
              You’re signed in as {roleLabel}, but you aren’t on the team list yet. Add your name and phone number so you show up here and can take calls.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.warning} />
        </Pressable>
      ) : null}

      <View style={styles.stats}>
        <Stat label="People" value={String(members?.length ?? 0)} />
        <Stat label="Active" value={String(active)} />
        <Stat label="Suspended" value={String(suspended)} warn={suspended > 0} />
        <Stat label="Invites" value={String(pending)} />
      </View>

      <View style={styles.links}>
        {canEditRoles ? <Shortcut icon="shield-checkmark-outline" color={colors.purple} label="Roles & permissions" onPress={() => router.push('/roles')} /> : null}
        {canAudit ? <Shortcut icon="document-lock-outline" color="#B45309" label="Audit log" onPress={() => router.push('/audit')} /> : null}
      </View>

      {canAdmins && members ? (
        <SuperAdmins members={members} me={me} changes={changes} />
      ) : null}

      <View style={styles.tabs}>
        {(['people', 'invites'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'people' ? 'People' : `Invites${pending ? ` · ${pending}` : ''}`}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tab === 'people' ? (
        groups.length ? (
          groups.map((g) => (
            <View key={g.role.id} style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={[styles.dot, { backgroundColor: roleColor(g.role.id) }]} />
                <Text style={styles.sectionTitle}>
                  {g.role.label} · {g.people.length}
                </Text>
              </View>
              {g.people.map((m) => (
                <Row key={m.human.id} member={m} isMe={m.human.id === me} />
              ))}
            </View>
          ))
        ) : (
          <EmptyState icon="people-outline" title="No one has signed up yet" />
        )
      ) : (
        <Invites invites={invites} roles={roleOrder} canInvite={canInvite} onChanged={load} presetRole="user" />
      )}
    </ScrollView>
  );
}

/** Super admins only: the owner, everyone else who is super admin, and making an email super admin straight away. */
function SuperAdmins({ members, me, changes }: { members: Member[]; me: string | null; changes: number }) {
  const [entries, setEntries] = useState<SuperAdminEntry[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const myRole = useAccess((s) => s.role);

  useEffect(() => {
    fetchSuperAdmins()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [changes, members]);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const candidates = members.filter((m) => m.human.role !== 'super_admin' && m.human.accountState === 'active' && m.human.email);

  const add = () => {
    const target = email.trim().toLowerCase();
    const onTeam = members.find((m) => (m.human.email ?? '').toLowerCase() === target);
    Alert.alert(
      `Make ${target} a super admin?`,
      `${onTeam ? `${onTeam.human.name} becomes super admin right now.` : 'They become super admin as soon as they sign in with this email. No invite is sent.'}\n\nSuper admins can do everything: edit roles, manage admins, suspend people and read the audit log. Only add people you fully trust.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make super admin',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              setEntries(await addSuperAdmin(target));
              setEmail('');
            } catch (e) {
              Alert.alert("Couldn't add the super admin", (e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const remove = (entry: SuperAdminEntry) =>
    Alert.alert(`Remove ${entry.name || entry.email} as super admin?`, 'They keep access as an Admin.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setEntries(await removeSuperAdmin(entry.email));
          } catch (e) {
            Alert.alert("Couldn't remove", (e as Error).message);
          }
        },
      },
    ]);

  const pick = () =>
    showSheet({
      title: 'Pick someone on the team',
      options: candidates.map((m) => ({ label: `${m.human.name} · ${m.human.email}`, icon: 'person-outline' as const, onPress: () => setEmail(m.human.email ?? '') })),
    });

  return (
    <View style={styles.supers}>
      <View style={styles.supersHead}>
        <Ionicons name="shield-checkmark" size={18} color={roleColor('super_admin')} />
        <Text style={styles.supersTitle}>Super admins · {entries?.length ?? '…'}</Text>
      </View>

      {(entries ?? []).map((e) => {
        const isMe = !!e.humanId && e.humanId === me;
        return (
          <View key={e.email} style={styles.superRow}>
            <Ionicons name={e.owner ? 'star' : e.humanId ? 'person-circle' : 'time-outline'} size={22} color={e.owner ? '#F59E0B' : roleColor('super_admin')} />
            <View style={styles.flex}>
              <Text style={styles.superName} numberOfLines={1}>
                {e.name || e.email}
                {isMe || (!e.humanId && myRole === 'super_admin' && !me && e.owner) ? ' (you)' : ''}
              </Text>
              <Text style={styles.superSub} numberOfLines={1}>
                {e.owner ? 'Owner · set in the server settings' : e.humanId ? `${e.email}${e.addedBy ? ` · added by ${e.addedBy}` : ''}` : 'Not signed in yet · super admin when they do'}
              </Text>
            </View>
            {e.owner ? (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerText}>Owner</Text>
              </View>
            ) : !isMe ? (
              <Pressable onPress={() => remove(e)} hitSlop={8}>
                <Text style={styles.revoke}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.addLabel}>Make someone super admin</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="their@email.com"
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={styles.addRow}>
        <Button title="Make super admin" onPress={add} disabled={!valid} loading={busy} style={styles.flex} />
        {candidates.length ? <Button title="From team" variant="secondary" onPress={pick} /> : null}
      </View>
      <Text style={styles.supersNote}>No invite is sent: the email becomes super admin right away, or the moment they sign in. The owner can’t be removed.</Text>
    </View>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warn && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Shortcut({ icon, color, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.shortcutText}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
    </Pressable>
  );
}

function Row({ member, isMe }: { member: Member; isMe: boolean }) {
  const h = member.human;
  const custom = Object.keys(h.grants ?? {}).length;
  const suspended = h.accountState === 'suspended';
  const presence = h.status === 'online' ? colors.success : h.status === 'busy' ? colors.warning : colors.border;
  return (
    <Pressable onPress={() => router.push({ pathname: '/member', params: { id: h.id } })} style={({ pressed }) => [styles.row, suspended && styles.suspendedRow, pressed && styles.pressed]}>
      <View>
        <Avatar label={h.name} photoUrl={null} size={44} />
        <View style={[styles.presence, { backgroundColor: presence }]} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.name, suspended && styles.struck]} numberOfLines={1}>
          {h.name}
          {isMe ? <Text style={styles.you}>  (you)</Text> : null}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {h.email ?? formatPhone(h.phone)} · {member.permissions.length} permissions
        </Text>
      </View>
      <View style={styles.right}>
        {suspended ? (
          <View style={styles.suspendedBadge}>
            <Text style={styles.suspendedText}>Suspended</Text>
          </View>
        ) : (
          <RoleBadge roleId={h.role} label={member.roleLabel} />
        )}
        {custom ? <Text style={styles.custom}>{custom} custom</Text> : null}
        {!member.manageable && !isMe ? <Ionicons name="lock-closed-outline" size={12} color={colors.muted} /> : null}
      </View>
    </Pressable>
  );
}

function Invites({
  invites,
  roles,
  canInvite,
  onChanged,
  presetRole,
}: {
  invites: Invite[];
  roles: RoleDef[];
  canInvite: boolean;
  onChanged: () => void;
  presetRole: string;
}) {
  const myRank = useAccess((s) => s.rank);
  const canAdmins = useCan('admins.manage');
  // Only roles you're allowed to hand out: below your rank (admins and up: super admins only)
  const offerable = roles.filter((r) => !r.locked && (r.rank >= ADMIN_RANK ? canAdmins : r.rank < myRank));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(presetRole);
  const [busy, setBusy] = useState(false);
  const label = (id: string) => roles.find((r) => r.id === id)?.label ?? id;
  const [showHistory, setShowHistory] = useState(false);
  const pending = invites.filter((i) => i.status === 'pending');
  const finished = invites.filter((i) => i.status !== 'pending');

  const clear = async () => {
    try {
      await clearInvites();
      onChanged();
    } catch (e) {
      Alert.alert("Couldn't clear", (e as Error).message);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      await createInvite(email.trim(), role);
      setEmail('');
      onChanged();
      Alert.alert('Invite saved', `When ${email.trim()} signs up with that email, they get the ${label(role)} role.`);
    } catch (e) {
      Alert.alert("Couldn't invite", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = (i: Invite) =>
    Alert.alert('Revoke this invite?', `${i.email} won't get the ${label(i.role)} role.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeInvite(i.id);
            onChanged();
          } catch (e) {
            Alert.alert("Couldn't revoke", (e as Error).message);
          }
        },
      },
    ]);

  return (
    <View style={styles.section}>
      {canInvite ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite someone</Text>
          <Text style={styles.hint}>They get this role automatically when they sign up with this email.</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={styles.chips}>
            {offerable.map((r) => (
              <Pressable key={r.id} onPress={() => setRole(r.id)} style={[styles.chip, role === r.id && { backgroundColor: roleColor(r.id), borderColor: roleColor(r.id) }]}>
                <Text style={[styles.chipText, role === r.id && styles.chipTextOn]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Send invite" onPress={send} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} loading={busy} />
        </View>
      ) : null}
      <Text style={styles.listTitle}>Waiting to sign up · {pending.length}</Text>
      {pending.length ? pending.map((i) => <InviteRow key={i.id} invite={i} label={label} onRevoke={canInvite ? () => revoke(i) : undefined} />) : <Text style={styles.hint}>No pending invites.</Text>}

      {finished.length ? (
        <>
          <View style={styles.historyHead}>
            <Pressable onPress={() => setShowHistory((v) => !v)} style={styles.historyToggle} hitSlop={8}>
              <Ionicons name={showHistory ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.muted} />
              <Text style={styles.listTitle}>Accepted, revoked & expired · {finished.length}</Text>
            </Pressable>
            {canInvite ? (
              <Pressable onPress={clear} hitSlop={8}>
                <Text style={styles.revoke}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          {showHistory ? finished.map((i) => <InviteRow key={i.id} invite={i} label={label} />) : null}
        </>
      ) : null}
    </View>
  );
}

function InviteRow({ invite: i, label, onRevoke }: { invite: Invite; label: (id: string) => string; onRevoke?: () => void }) {
  return (
    <View style={[styles.inviteRow, i.status !== 'pending' && styles.finishedRow]}>
      <Ionicons
        name={i.status === 'accepted' ? 'checkmark-circle' : i.status === 'pending' ? 'mail-outline' : 'close-circle-outline'}
        size={22}
        color={i.status === 'accepted' ? colors.success : i.status === 'pending' ? colors.primary : colors.muted}
      />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {i.email}
        </Text>
        <Text style={styles.sub}>
          {label(i.role)} · {i.status} · by {i.invitedBy} {timeAgo(i.createdAt)}
        </Text>
      </View>
      {onRevoke ? (
        <Pressable onPress={onRevoke} hitSlop={8}>
          <Text style={styles.revoke}>Revoke</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  links: { gap: 8 },
  setup: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7ED', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: '#FCD34D' },
  setupTitle: { fontSize: 15, fontWeight: '700', color: '#92400E' },
  setupText: { fontSize: 12, color: '#92400E', lineHeight: 17, marginTop: 2 },
  supers: { backgroundColor: '#7C3AED0D', borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: 1, borderColor: '#7C3AED33' },
  superRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, padding: 10 },
  superSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  ownerBadge: { backgroundColor: '#F59E0B22', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  ownerText: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  addLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 8 },
  supersHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supersTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  superList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  superChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, maxWidth: '100%' },
  superName: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1 },
  supersNote: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  shortcutText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.75 },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.text },
  tabTextOn: { color: '#fff' },
  error: { fontSize: 13, color: colors.danger },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  suspendedRow: { opacity: 0.7 },
  presence: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.card },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  struck: { textDecorationLine: 'line-through' },
  you: { fontSize: 13, fontWeight: '400', color: colors.muted },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  custom: { fontSize: 11, color: colors.warning, fontWeight: '600' },
  suspendedBadge: { backgroundColor: colors.danger + '18', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  suspendedText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTextOn: { color: '#fff' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  revoke: { fontSize: 13, fontWeight: '700', color: colors.danger },
  listTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4, marginTop: 4 },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4, marginTop: 6 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  finishedRow: { opacity: 0.65 },
});

export default function TeamRoute() {
  return (
    <Gate perm="team.view">
      <TeamScreen />
    </Gate>
  );
}
