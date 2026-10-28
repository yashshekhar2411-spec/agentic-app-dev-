import { StyleSheet, Text, View } from 'react-native';

import { roleColor } from '@/features/rbac/store';
import { radius } from '@/theme';

export function RoleBadge({ roleId, label, large }: { roleId: string; label: string; large?: boolean }) {
  const color = roleColor(roleId);
  return (
    <View style={[styles.badge, large && styles.large, { backgroundColor: color + '18' }]}>
      <Text style={[styles.text, large && styles.largeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  large: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  text: { fontSize: 12, fontWeight: '700' },
  largeText: { fontSize: 16, fontWeight: '800' },
});
