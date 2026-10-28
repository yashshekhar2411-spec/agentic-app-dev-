// Tap the flag on the Call tab to call a number in another country.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { COUNTRIES, countryFor } from '@/features/settings/store';
import { colors, radius } from '@/theme';

export function CountryPicker({ code, onChange }: { code: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const country = countryFor(code);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.chip} accessibilityLabel={`Country ${country?.name ?? code}`}>
        <Text style={styles.flag}>{country?.flag ?? '🌐'}</Text>
        <Text style={styles.code}>{code}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.heading}>Call a number in</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => (onChange(item.code), setOpen(false))}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.rowCode}>{item.code}</Text>
                  {item.code === code ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  flag: { fontSize: 18 },
  code: { fontSize: 14, fontWeight: '600', color: colors.text },
  backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 8, maxHeight: '75%' },
  heading: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, padding: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  pressed: { backgroundColor: colors.bg },
  name: { flex: 1, fontSize: 15, color: colors.text },
  rowCode: { fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] },
});
