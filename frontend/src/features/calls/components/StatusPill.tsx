import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { CallStatus } from '@/types';

const STYLE: Record<CallStatus, { label: string; color: string }> = {
  ai_active: { label: 'AI handling', color: colors.ai },
  awaiting_human: { label: 'Needs a human', color: colors.warning },
  human_active: { label: 'With human', color: colors.success },
  voicemail: { label: 'Voicemail', color: colors.purple },
  ended: { label: 'Ended', color: colors.muted },
};

export function StatusPill({ status }: { status: CallStatus }) {
  const { label, color } = STYLE[status];
  return (
    <View style={[styles.pill, { backgroundColor: color + '1A' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '600' },
});
