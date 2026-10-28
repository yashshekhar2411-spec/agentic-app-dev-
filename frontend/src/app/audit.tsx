// Audit log (super admins): every change to roles and access, newest first. With a targetId, one person's history.
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { groupByDayLabel } from '@/features/rbac/audit';
import { Gate } from '@/features/rbac/components/Gate';
import { fetchAudit } from '@/features/rbac/api';
import { useAccess } from '@/features/rbac/store';
import { colors, radius } from '@/theme';
import type { AuditEntry } from '@/types';

type IconName = keyof typeof Ionicons.glyphMap;

const KIND: Record<string, { icon: IconName; color: string; verb: string }> = {
  'role.changed': { icon: 'swap-vertical', color: colors.primary, verb: 'changed the role of' },
  'access.allowed': { icon: 'add-circle', color: colors.success, verb: 'gave access to' },
  'access.denied': { icon: 'remove-circle', color: colors.danger, verb: 'took access from' },
  'access.reset': { icon: 'refresh-circle', color: colors.muted, verb: 'reset access for' },
  'member.suspended': { icon: 'ban', color: colors.danger, verb: 'suspended' },
  'member.reactivated': { icon: 'checkmark-circle', color: colors.success, verb: 'reactivated' },
  'member.replaced': { icon: 'swap-horizontal', color: colors.warning, verb: 'replaced' },
  'invite.created': { icon: 'mail', color: colors.primary, verb: 'invited' },
  'invite.revoked': { icon: 'mail-unread', color: colors.muted, verb: 'revoked the invite for' },
  'invite.accepted': { icon: 'person-add', color: colors.success, verb: 'joined as' },
  'role.created': { icon: 'shield', color: colors.purple, verb: 'created the role' },
  'role.permissions': { icon: 'shield-half', color: colors.purple, verb: 'changed the role' },
  'role.reset': { icon: 'shield-outline', color: colors.purple, verb: 'reset the role' },
  'role.deleted': { icon: 'trash', color: colors.danger, verb: 'deleted the role' },
  'superadmin.added': { icon: 'shield-checkmark', color: colors.purple, verb: 'made super admin' },
  'superadmin.removed': { icon: 'shield-outline', color: colors.danger, verb: 'removed super admin from' },
  'member.removed': { icon: 'person-remove', color: colors.danger, verb: 'removed' },
  'invite.cleared': { icon: 'mail-open', color: colors.muted, verb: 'cleared' },
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'role', label: 'Roles' },
  { id: 'access', label: 'Access' },
  { id: 'member', label: 'Accounts' },
  { id: 'invite', label: 'Invites' },
];

function AuditScreen() {
  const { targetId, name } = useLocalSearchParams<{ targetId?: string; name?: string }>();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const changes = useAccess((s) => s.changes);

  const load = useCallback(async () => {
    try {
      setEntries((await fetchAudit(targetId)).entries);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [targetId]);
  useEffect(() => void load(), [load, changes]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (entries ?? []).filter(
      (e) =>
        (filter === 'all' || e.action.startsWith(filter + '.')) &&
        (!q || [e.actorName, e.targetName, e.detail, e.action].some((t) => t.toLowerCase().includes(q))),
    );
    return groupByDayLabel(shown);
  }, [entries, filter, query]);

  if (!entries && !error) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.content}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await load(), setRefreshing(false))} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {targetId ? <Stack.Screen options={{ title: `History · ${name ?? ''}` }} /> : null}
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search people or changes" placeholderTextColor={colors.muted} style={styles.searchInput} />
          </View>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable key={f.id} onPress={() => setFilter(f.id)} style={[styles.filter, filter === f.id && styles.filterOn]}>
                <Text style={[styles.filterText, filter === f.id && styles.filterTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListEmptyComponent={<EmptyState icon="document-lock-outline" title="Nothing yet" hint="Changes to roles and access show up here." />}
      renderItem={({ item }) => <Row entry={item} />}
    />
  );
}

function Row({ entry }: { entry: AuditEntry }) {
  const kind = KIND[entry.action] ?? { icon: 'ellipse' as IconName, color: colors.muted, verb: entry.action };
  const joined = entry.action === 'invite.accepted';
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: kind.color + '18' }]}>
        <Ionicons name={kind.icon} size={18} color={kind.color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.text}>
          <Text style={styles.bold}>{entry.actorName}</Text> {kind.verb} {joined ? '' : <Text style={styles.bold}>{entry.targetName}</Text>}
        </Text>
        {entry.detail ? <Text style={styles.detail}>{entry.detail}</Text> : null}
        <Text style={styles.time}>{new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  content: { padding: 16, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.text },
  filterTextOn: { color: '#fff' },
  error: { fontSize: 13, color: colors.danger },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bold: { fontWeight: '700' },
  detail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  time: { fontSize: 11, color: colors.muted, marginTop: 4 },
});

export default function AuditRoute() {
  return (
    <Gate perm="audit.view">
      <AuditScreen />
    </Gate>
  );
}
