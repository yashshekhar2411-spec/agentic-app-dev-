// Roles & permissions (super admins): every role from highest to lowest, and creating custom roles.
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Gate } from '@/features/rbac/components/Gate';
import { fetchCatalog } from '@/features/rbac/api';
import { roleColor } from '@/features/rbac/store';
import { colors, radius } from '@/theme';
import type { Catalog } from '@/types';

function RolesScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchCatalog()
        .then(setCatalog)
        .catch((e) => Alert.alert("Couldn't load roles", (e as Error).message));
    }, []),
  );
  if (!catalog) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  const total = catalog.permissions.length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Roles are ranked from highest to lowest. People can only manage roles ranked below their own. Locked permissions are exclusive to super admins.
      </Text>
      {catalog.roles.map((r, i) => (
        <Pressable key={r.id} onPress={() => router.push({ pathname: '/role', params: { id: r.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={[styles.rank, { backgroundColor: roleColor(r.id) }]}>
            <Text style={styles.rankText}>{i + 1}</Text>
          </View>
          <View style={styles.flex}>
            <View style={styles.titleRow}>
              <Text style={styles.name}>{r.label}</Text>
              {r.locked ? <Ionicons name="lock-closed" size={13} color={colors.purple} /> : null}
              {!r.builtin ? <Text style={styles.custom}>Custom</Text> : null}
            </View>
            <Text style={styles.desc} numberOfLines={2}>
              {r.description || 'No description'}
            </Text>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${(r.permissions.length / total) * 100}%`, backgroundColor: roleColor(r.id) }]} />
            </View>
            <Text style={styles.count}>
              {r.permissions.length} of {total} permissions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ))}
      <Button title="Create a custom role" onPress={() => router.push('/role')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  intro: { fontSize: 14, color: colors.muted, lineHeight: 20, paddingHorizontal: 4, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.8 },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  custom: { fontSize: 11, fontWeight: '700', color: '#0D9488', backgroundColor: '#0D948818', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  desc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 8, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  count: { fontSize: 11, color: colors.muted, marginTop: 4 },
});

export default function RolesRoute() {
  return (
    <Gate perm="roles.manage">
      <RolesScreen />
    </Gate>
  );
}
