// Instagram-style settings list: small grey section titles, rows with an icon, label, detail and a chevron or switch
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SettingsRowSpec {
  key: string;
  icon: IconName;
  iconColor?: string; // tile colour behind the icon
  title: string;
  subtitle?: string;
  value?: string; // short text on the right, before the chevron
  badge?: ReactNode; // e.g. a connection pill
  keywords?: string; // extra words the search matches
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean };
  selected?: boolean; // pick-one lists: shows a check instead of a chevron
  destructive?: boolean; // red title, e.g. "Reset"
  right?: ReactNode; // custom control on the right (e.g. a stepper)
}

export interface SettingsSectionSpec {
  title: string;
  rows: SettingsRowSpec[];
  footer?: string; // small grey explanation under the group
}

export function SettingsSection({ title, rows, footer }: SettingsSectionSpec) {
  if (!rows.length) return null;
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <SettingsRow key={row.key} row={row} last={i === rows.length - 1} />
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

function SettingsRow({ row, last }: { row: SettingsRowSpec; last: boolean }) {
  const { toggle } = row;
  const press = toggle ? () => !toggle.disabled && toggle.onChange(!toggle.value) : row.onPress;
  return (
    <Pressable onPress={press} disabled={!press} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.iconTile, { backgroundColor: row.iconColor ?? colors.primary }]}>
        <Ionicons name={row.icon} size={18} color="#fff" />
      </View>
      <View style={[styles.main, !last && styles.separator]}>
        <View style={styles.texts}>
          <Text style={[styles.title, row.destructive && styles.destructive]} numberOfLines={1}>
            {row.title}
          </Text>
          {row.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {row.subtitle}
            </Text>
          ) : null}
        </View>
        {row.badge}
        {row.value ? <Text style={styles.value}>{row.value}</Text> : null}
        {row.right}
        {row.selected !== undefined ? (
          <Ionicons name={row.selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={row.selected ? colors.primary : '#D1D5DB'} />
        ) : toggle ? (
          <Switch
            value={toggle.value}
            onValueChange={toggle.onChange}
            disabled={toggle.disabled}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        ) : row.onPress ? (
          <Ionicons name="chevron-forward" size={18} color="#C4C7CF" />
        ) : null}
      </View>
    </Pressable>
  );
}

/** Rows whose title, subtitle or keywords contain every word of the query */
export function searchRows(sections: SettingsSectionSpec[], query: string): SettingsRowSpec[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections
    .flatMap((s) => s.rows.map((r) => ({ row: r, text: `${s.title} ${r.title} ${r.subtitle ?? ''} ${r.keywords ?? ''}`.toLowerCase() })))
    .filter(({ text }) => words.every((w) => text.includes(w)))
    .map(({ row }) => row);
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  footer: { fontSize: 12, color: colors.muted, paddingHorizontal: 4, lineHeight: 17 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, gap: 12 },
  pressed: { backgroundColor: colors.bg },
  iconTile: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingRight: 14, minHeight: 56 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 15, color: colors.text, fontWeight: '500' },
  destructive: { color: colors.danger },
  subtitle: { fontSize: 13, color: colors.muted },
  value: { fontSize: 14, color: colors.muted },
});
