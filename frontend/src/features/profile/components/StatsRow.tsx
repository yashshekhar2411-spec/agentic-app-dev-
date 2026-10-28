// Instagram-style counters (posts · followers · following), here for today's calls
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function StatsRow({ humanId }: { humanId?: string }) {
  const calls = useLive((s) => s.calls);
  const handoffs = useLive((s) => s.handoffs);

  const stats = useMemo(() => {
    const today = Object.values(calls).filter((c) => isToday(c.startedAt));
    return [
      { label: 'Calls today', value: today.length },
      { label: 'AI resolved', value: today.filter((c) => c.status === 'ended' && !c.handoffId).length },
      {
        label: 'You took',
        value: Object.values(handoffs).filter((h) => humanId && h.assignedTo === humanId && isToday(h.createdAt)).length,
      },
    ];
  }, [calls, handoffs, humanId]);

  return (
    <View style={styles.row}>
      {stats.map((s, i) => (
        <View key={s.label} style={[styles.stat, i > 0 && styles.divider]}>
          <Text style={styles.value}>{s.value}</Text>
          <Text style={styles.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  value: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, color: colors.muted },
});
