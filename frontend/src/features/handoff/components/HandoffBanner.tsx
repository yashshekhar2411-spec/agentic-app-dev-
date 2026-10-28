import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useLive } from '@/state/liveStore';
import { selectPendingCount } from '@/features/handoff/selectors';
import { colors, radius } from '@/theme';

export function HandoffBanner() {
  const count = useLive(selectPendingCount);
  if (count === 0) return null;
  return (
    <Pressable style={styles.banner} onPress={() => router.navigate('/queue')}>
      <Ionicons name="hand-left" size={18} color="#fff" />
      <Text style={styles.text}>
        {count} {count === 1 ? 'caller needs' : 'callers need'} a human
      </Text>
      <Ionicons name="chevron-forward" size={18} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.warning, padding: 14, borderRadius: radius.md },
  text: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 },
});
