// Online / Busy / Offline. Only online agents get handoff alerts.
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { setMyStatus } from '@/features/profile/availability';
import { colors, radius } from '@/theme';
import type { HumanStatus } from '@/types';
import { STATUS_COLOR } from '@/components/ui/Avatar';

const OPTIONS: { status: HumanStatus; label: string; hint: string }[] = [
  { status: 'online', label: 'Online', hint: 'You get an alert for every caller who needs a person.' },
  { status: 'busy', label: 'Busy', hint: 'Alerts are paused while you finish a call or step away.' },
  { status: 'offline', label: 'Offline', hint: 'No alerts. Calls go to other agents, or to voicemail.' },
];

export function AvailabilityPicker({ status }: { status: HumanStatus }) {
  const [saving, setSaving] = useState<HumanStatus | null>(null);

  const choose = async (next: HumanStatus) => {
    if (next === status || saving) return;
    setSaving(next);
    try {
      await setMyStatus(next);
    } catch (e) {
      Alert.alert('Could not change status', (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Availability</Text>
      <View style={styles.segment}>
        {OPTIONS.map((o) => {
          const on = o.status === status;
          return (
            <Pressable key={o.status} onPress={() => choose(o.status)} style={[styles.option, on && styles.optionOn]}>
              {saving === o.status ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={[styles.dot, { backgroundColor: STATUS_COLOR[o.status] }]} />
              )}
              <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{OPTIONS.find((o) => o.status === status)?.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.pill, padding: 4 },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.pill },
  optionOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  labelOn: { color: colors.text, fontWeight: '700' },
  hint: { fontSize: 13, color: colors.muted },
});
