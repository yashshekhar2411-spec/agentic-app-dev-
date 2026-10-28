// Every permission, grouped by module (Calls, Contacts, Scheduling...). Each row shows whether it's on, and can be
// tapped (with `onPress`) to change it. A module header can turn its whole group on or off (`onToggleGroup`).
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { Catalog, Permission, PermissionId } from '@/types';

type IconName = keyof typeof Ionicons.glyphMap;

export function PermissionGroups({
  catalog,
  isOn,
  onToggle,
  onToggleGroup,
  onPress,
  detail,
  disabled,
  hideSuperOnly,
}: {
  catalog: Catalog;
  isOn: (p: PermissionId) => boolean;
  onToggle?: (p: PermissionId, on: boolean) => void; // switch rows (role editor)
  onToggleGroup?: (perms: PermissionId[], on: boolean) => void;
  onPress?: (p: Permission) => void; // tappable rows (a person's access)
  detail?: (p: Permission) => ReactNode; // extra line under a row, e.g. "Allowed until 4 PM"
  disabled?: boolean;
  hideSuperOnly?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      {catalog.modules.map((m) => {
        const perms = catalog.permissions.filter((p) => p.module === m.id && !(hideSuperOnly && p.superOnly));
        if (!perms.length) return null;
        const on = perms.filter((p) => isOn(p.id)).length;
        const all = on === perms.length;
        return (
          <View key={m.id} style={styles.group}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Ionicons name={m.icon as IconName} size={16} color={colors.primary} />
              </View>
              <Text style={styles.module}>{m.label}</Text>
              <Text style={styles.count}>
                {on}/{perms.length}
              </Text>
              {onToggleGroup && !perms.some((p) => p.superOnly) ? (
                <Pressable onPress={() => onToggleGroup(perms.map((p) => p.id), !all)} disabled={disabled} hitSlop={8}>
                  <Text style={[styles.all, disabled && styles.dim]}>{all ? 'None' : 'All'}</Text>
                </Pressable>
              ) : null}
            </View>
            {perms.map((p) => {
              const active = isOn(p.id);
              const row = (
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.label, !active && styles.off]}>{p.label}</Text>
                      {p.superOnly ? <Ionicons name="lock-closed" size={12} color={colors.purple} /> : null}
                    </View>
                    <Text style={styles.desc}>{p.description}</Text>
                    {detail?.(p)}
                  </View>
                  {onToggle ? (
                    <Switch value={active} onValueChange={(v) => onToggle(p.id, v)} disabled={disabled || p.superOnly} />
                  ) : (
                    <Ionicons name={active ? 'checkmark-circle' : 'close-circle-outline'} size={22} color={active ? colors.success : colors.border} />
                  )}
                </View>
              );
              return onPress ? (
                <Pressable key={p.id} onPress={() => onPress(p)} disabled={disabled || p.superOnly} style={({ pressed }) => pressed && styles.pressed}>
                  {row}
                </Pressable>
              ) : (
                <View key={p.id}>{row}</View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  icon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  module: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  count: { fontSize: 12, fontWeight: '600', color: colors.muted },
  all: { fontSize: 13, fontWeight: '700', color: colors.primary, marginLeft: 6 },
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  off: { color: colors.muted },
  desc: { fontSize: 12, color: colors.muted, marginTop: 1 },
});
