// One team member: their role, single permissions allowed / denied for them (optionally for a limited time),
// suspend / reactivate, hand their access to someone else (replace), and what changed for them.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { showSheet } from '@/components/ui/ActionSheet';
import { Gate } from '@/features/rbac/components/Gate';
import { PermissionGroups } from '@/features/rbac/components/PermissionGroups';
import { RoleBadge } from '@/features/rbac/components/RoleBadge';
import {
  fetchAudit,
  fetchCatalog,
  fetchMembers,
  reactivateMember,
  replaceMember,
  suspendMember,
  updateMember,
  type GrantChange,
} from '@/features/rbac/api';
import { ADMIN_RANK, roleColor, useAccess, useCan } from '@/features/rbac/store';
import { colors, radius } from '@/theme';
import type { AuditEntry, Catalog, Member, Permission, PermissionId, RoleDef } from '@/types';
import { formatPhone } from '@/utils/phone';
import { timeAgo } from '@/utils/time';

const DURATIONS: { label: string; hours?: number }[] = [
  { label: 'Permanently' },
  { label: 'For 1 hour', hours: 1 },
  { label: 'For 1 day', hours: 24 },
  { label: 'For 7 days', hours: 24 * 7 },
];

const until = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const me = useAccess();
  const canManage = useCan('team.manage');
  const canAdmins = useCan('admins.manage');
  const canAudit = useCan('audit.view');

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([fetchMembers(), fetchCatalog()]);
      setMembers(m);
      setCatalog(c);
      if (canAudit) setHistory((await fetchAudit(id)).entries.slice(0, 15));
    } catch (e) {
      Alert.alert("Couldn't load", (e as Error).message);
    }
  }, [id, canAudit]);
  useEffect(() => void load(), [load, me.changes]);

  const member = members?.find((m) => m.human.id === id);
  if (!members || !catalog) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (!member) return <Text style={styles.missing}>This person is no longer on the team.</Text>;

  const h = member.human;
  const isMe = h.id === me.humanId;
  const role = catalog.roles.find((r) => r.id === h.role);
  const isSuper = role?.locked ?? false;
  const editable = member.manageable;
  const suspended = h.accountState === 'suspended';
  // Roles the signed-in person may hand out
  const canGive = (r: RoleDef) => (r.rank >= ADMIN_RANK ? canAdmins : r.rank < me.rank);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert(`Couldn't ${what}`, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (r: RoleDef) => {
    if (r.id === h.role) return;
    const toSuper = r.locked;
    Alert.alert(
      `Make ${h.name} ${r.label}?`,
      toSuper
        ? `${h.name} will be able to do everything you can: edit roles, manage admins (and you), suspend people and read the audit log. Only do this for someone you fully trust.`
        : r.description || `They get what the ${r.label} role allows.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: toSuper ? 'Make super admin' : 'Change role',
          style: toSuper ? 'destructive' : 'default',
          onPress: () => void run('change the role', () => updateMember(h.id, { role: r.id })),
        },
      ],
    );
  };

  const setGrant = (perm: PermissionId, change: GrantChange) => run('change access', () => updateMember(h.id, { grants: { [perm]: change } }));

  const editPermission = (p: Permission) => {
    if (!editable || isSuper) return;
    const fromRole = role?.permissions.includes(p.id) ?? false;
    const grant = h.grants?.[p.id];
    const mine = me.permissions.includes(p.id);
    if (!mine) return Alert.alert("You can't change this", `You don't have “${p.label}” yourself, so you can't give it or take it away.`);
    showSheet({
      title: p.label,
      message: `${p.description}. ${fromRole ? `The ${role?.label} role includes it.` : `The ${role?.label} role doesn't include it.`}`,
      options: [
        ...DURATIONS.map((d) => ({ label: `Allow ${d.label.toLowerCase()}`, icon: 'checkmark-circle-outline' as const, onPress: () => void setGrant(p.id, { allow: true, expiresInHours: d.hours }) })),
        ...DURATIONS.slice(0, 3).map((d) => ({
          label: `Take away ${d.label.toLowerCase()}`,
          icon: 'remove-circle-outline' as const,
          destructive: true,
          onPress: () => void setGrant(p.id, { allow: false, expiresInHours: d.hours }),
        })),
        ...(grant ? [{ label: `Back to the ${role?.label} role`, icon: 'refresh' as const, onPress: () => void setGrant(p.id, null) }] : []),
      ],
    });
  };

  const toggleSuspend = () => {
    if (suspended) return void run('reactivate', () => reactivateMember(h.id));
    Alert.alert(`Suspend ${h.name}?`, 'They keep their role, but can’t use anything until someone reactivates them.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => void run('suspend', () => suspendMember(h.id)) },
    ]);
  };

  const replace = () => {
    const candidates = members.filter((m) => m.human.id !== h.id && m.human.accountState === 'active' && m.manageable);
    if (!candidates.length) return Alert.alert('No one to replace them with', 'Invite or add someone you can manage first.');
    showSheet({
      title: `Replace ${h.name}`,
      message: `Pick who takes over. They get ${h.name}’s role (${member.roleLabel}) and custom access, and ${h.name} is suspended.`,
      options: candidates.map((c) => ({
        label: `${c.human.name} · now ${c.roleLabel}`,
        icon: 'swap-horizontal' as const,
        onPress: () =>
          Alert.alert(`Replace ${h.name} with ${c.human.name}?`, `${c.human.name} becomes ${member.roleLabel}. ${h.name} is suspended.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Replace', style: 'destructive', onPress: () => void run('replace', () => replaceMember(h.id, c.human.id)) },
          ]),
      })),
    });
  };

  const detail = (p: Permission) => {
    const g = h.grants?.[p.id];
    if (!g) return null;
    const expired = g.expiresAt && new Date(g.expiresAt).getTime() < Date.now();
    const text = `${g.allow ? 'Allowed' : 'Taken away'} for ${h.name}${g.expiresAt ? ` until ${until(g.expiresAt)}` : ''}${expired ? ' (expired)' : ''}${g.by ? ` · by ${g.by}` : ''}`;
    return <Text style={[styles.grant, { color: g.allow ? colors.success : colors.danger }]}>{text}</Text>;
  };

  const reason = isMe ? 'You can’t change your own role or access.' : !canManage ? 'Your role can see the team but not change it.' : 'Only a super admin can change admins and super admins.';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: h.name }} />
      <View style={styles.hero}>
        <Avatar label={h.name} photoUrl={null} size={64} />
        <Text style={styles.name}>
          {h.name}
          {isMe ? ' (you)' : ''}
        </Text>
        <Text style={styles.sub}>{[h.email, formatPhone(h.phone)].filter(Boolean).join(' · ')}</Text>
        <View style={styles.badges}>
          <RoleBadge roleId={h.role} label={member.roleLabel} />
          {suspended ? (
            <View style={styles.suspended}>
              <Text style={styles.suspendedText}>Suspended</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sub}>{member.permissions.length} permissions</Text>
      </View>

      {!editable ? (
        <View style={styles.notice}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
          <Text style={styles.noticeText}>{reason}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Role</Text>
      <View style={styles.card}>
        {catalog.roles.map((r) => {
          const on = r.id === h.role;
          const allowed = editable && canGive(r);
          return (
            <Pressable key={r.id} onPress={() => changeRole(r)} disabled={!allowed || busy} style={[styles.roleRow, on && styles.roleOn, !allowed && !on && styles.dim]}>
              <View style={[styles.radio, on && { borderColor: roleColor(r.id) }]}>{on ? <View style={[styles.radioDot, { backgroundColor: roleColor(r.id) }]} /> : null}</View>
              <View style={styles.flex}>
                <Text style={[styles.roleName, { color: on ? roleColor(r.id) : colors.text }]}>
                  {r.label}
                  {r.builtin ? '' : '  · custom'}
                </Text>
                <Text style={styles.hint}>{r.description || `${r.permissions.length} permissions`}</Text>
              </View>
              {!allowed && !on ? <Ionicons name="lock-closed-outline" size={14} color={colors.muted} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Access</Text>
      <Text style={styles.hint}>
        {isSuper ? 'Super admins can do everything.' : editable ? `Tap a permission to give or take it away for ${h.name} only, permanently or for a while.` : 'What this person can do.'}
      </Text>
      <PermissionGroups catalog={catalog} isOn={(p) => member.permissions.includes(p)} onPress={editable && !isSuper ? editPermission : undefined} detail={detail} disabled={busy} />

      {editable ? (
        <>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.actions}>
            <Button title={suspended ? 'Reactivate' : 'Suspend'} variant={suspended ? 'primary' : 'danger'} onPress={toggleSuspend} loading={busy} style={styles.flex} />
            <Button title="Replace…" variant="secondary" onPress={replace} disabled={busy} style={styles.flex} />
          </View>
        </>
      ) : null}

      {canAudit ? (
        <>
          <View style={styles.titleRow}>
            <Text style={[styles.sectionTitle, styles.flex]}>Recent changes</Text>
            <Pressable onPress={() => router.push({ pathname: '/audit', params: { targetId: h.id, name: h.name } })} hitSlop={8}>
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            {history.length ? (
              history.map((e) => (
                <Text key={e.id} style={styles.historyRow}>
                  <Text style={styles.bold}>{e.actorName}</Text> {e.action.replace('.', ' ')} {e.detail ? `· ${e.detail}` : ''} <Text style={styles.time}>{timeAgo(e.at)}</Text>
                </Text>
              ))
            ) : (
              <Text style={styles.hint}>No changes yet.</Text>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  missing: { padding: 24, textAlign: 'center', color: colors.muted },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 6, paddingBottom: 4 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', gap: 6 },
  suspended: { backgroundColor: colors.danger + '18', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  suspendedText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  noticeText: { flex: 1, fontSize: 13, color: colors.muted },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, marginTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
  roleOn: { backgroundColor: colors.bg },
  dim: { opacity: 0.45 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  roleName: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18, paddingHorizontal: 4 },
  grant: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10 },
  historyRow: { fontSize: 13, color: colors.text, lineHeight: 19, paddingVertical: 3 },
  bold: { fontWeight: '700' },
  time: { color: colors.muted },
});

export default function MemberRoute() {
  return (
    <Gate perm="team.view">
      <MemberScreen />
    </Gate>
  );
}
