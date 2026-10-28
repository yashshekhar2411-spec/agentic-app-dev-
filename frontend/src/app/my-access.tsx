// My access: the signed-in person's role and every permission they have, plus how the roles compare.
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PermissionGroups } from '@/features/rbac/components/PermissionGroups';
import { RoleBadge } from '@/features/rbac/components/RoleBadge';
import { fetchCatalog } from '@/features/rbac/api';
import { roleColor, useAccess } from '@/features/rbac/store';
import { colors, radius } from '@/theme';
import type { Catalog } from '@/types';

export default function MyAccessScreen() {
  const { role, roleLabel, permissions, suspended } = useAccess();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void useAccess.getState().refresh();
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setFailed(true));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <RoleBadge roleId={role} label={roleLabel} large />
      <Text style={styles.intro}>
        {suspended
          ? 'Your account is suspended: you can’t use anything until an admin reactivates you.'
          : role === 'super_admin'
            ? 'You can do everything, including the exclusive super admin powers.'
            : `You have ${permissions.length} permissions. Ask an admin if you need more.`}
      </Text>
      {failed ? <Text style={styles.error}>Couldn’t load the permission list from the server.</Text> : null}
      {!catalog && !failed ? <ActivityIndicator color={colors.primary} /> : null}

      {catalog ? (
        <>
          <Text style={styles.sectionTitle}>Your permissions</Text>
          <PermissionGroups catalog={catalog} isOn={(p) => !suspended && permissions.includes(p)} />

          <Text style={styles.sectionTitle}>How the roles compare</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={[styles.moduleCell, styles.head]}>Module</Text>
              {catalog.roles.map((r) => (
                <Text key={r.id} style={[styles.cell, styles.head, { color: roleColor(r.id) }, r.id === role && styles.mine]} numberOfLines={2}>
                  {r.label}
                </Text>
              ))}
            </View>
            {catalog.modules.map((m) => {
              const perms = catalog.permissions.filter((p) => p.module === m.id);
              return (
                <View key={m.id} style={[styles.row, styles.body]}>
                  <Text style={styles.moduleCell}>{m.label}</Text>
                  {catalog.roles.map((r) => {
                    const n = perms.filter((p) => r.permissions.includes(p.id)).length;
                    const color = n === perms.length ? colors.success : n ? colors.ai : colors.muted;
                    return (
                      <Text key={r.id} style={[styles.cell, { color }, r.id === role && styles.mine]}>
                        {n === perms.length ? 'All' : n ? `${n}/${perms.length}` : '—'}
                      </Text>
                    );
                  })}
                </View>
              );
            })}
            <Text style={styles.note}>
              Ranks go from highest to lowest, left to right. Security powers (roles, admins, audit log) belong to super admins only. Admins manage the
              roles to their right.
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  intro: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  head: { fontSize: 11, fontWeight: '700', color: colors.muted },
  moduleCell: { flex: 1.6, fontSize: 13, color: colors.text },
  cell: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  mine: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, overflow: 'hidden', paddingVertical: 2 },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: 6 },
});
