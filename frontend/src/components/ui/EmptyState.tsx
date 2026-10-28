import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function EmptyState({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={40} color={colors.muted} />
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
