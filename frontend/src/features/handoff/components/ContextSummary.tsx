import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { Handoff } from '@/types';

export function ContextSummary({ handoff }: { handoff: Handoff }) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>AI summary</Text>
      <Text style={[styles.text, !handoff.summary && styles.pending]}>{handoff.summary || 'Preparing summary…'}</Text>
      {handoff.detail ? <Text style={styles.detail}>Why: {handoff.detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, gap: 4 },
  label: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  pending: { color: colors.muted, fontStyle: 'italic' },
  detail: { fontSize: 13, color: colors.muted },
});
