// Default country code for the Call tab: a simple pick-one list
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { COUNTRIES, usePreferences } from '@/features/settings/store';
import { colors, radius } from '@/theme';

export default function CountryScreen() {
  const current = usePreferences((s) => s.countryCode);
  const set = usePreferences((s) => s.set);

  return (
    <FlatList
      data={COUNTRIES}
      keyExtractor={(c) => c.code}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<Text style={styles.hint}>Numbers you dial on the Call tab start with this code. You can still type a different one.</Text>}
      renderItem={({ item, index }) => {
        const on = item.code === current;
        return (
          <Pressable
            onPress={() => {
              set({ countryCode: item.code });
              router.back();
            }}
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.first,
              index === COUNTRIES.length - 1 && styles.last,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.flag}>{item.flag}</Text>
            <View style={[styles.main, index < COUNTRIES.length - 1 && styles.separator]}>
              <Text style={[styles.name, on && styles.nameOn]}>{item.name}</Text>
              <Text style={styles.code}>{item.code}</Text>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.primary : '#D1D5DB'} />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  hint: { fontSize: 13, color: colors.muted, marginBottom: 12, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, backgroundColor: colors.card, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: StyleSheet.hairlineWidth },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { backgroundColor: colors.bg },
  flag: { fontSize: 22 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: 14 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  name: { flex: 1, fontSize: 15, color: colors.text },
  nameOn: { fontWeight: '700' },
  code: { fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] },
});
