// Small coloured status label, e.g. "● Live" or "● Offline"
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

export function Pill({ label, tone }: { label: string; tone: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? colors.success : tone === 'bad' ? colors.danger : colors.muted;
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1A` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
});
