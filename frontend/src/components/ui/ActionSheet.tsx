// A bottom sheet of choices, for when Android's Alert (three buttons at most) isn't enough.
// Call showSheet(...) from anywhere; <SheetHost /> in the root layout draws it.
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius } from '@/theme';

export interface SheetOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface Sheet {
  title: string;
  message?: string;
  options: SheetOption[];
}

const useSheet = create<{ sheet: Sheet | null }>()(() => ({ sheet: null }));

export const showSheet = (sheet: Sheet) => useSheet.setState({ sheet });
const hide = () => useSheet.setState({ sheet: null });

export function SheetHost() {
  const sheet = useSheet((s) => s.sheet);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={hide} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={hide} accessibilityLabel="Close" />
      {sheet ? (
        <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grip} />
          <Text style={styles.title}>{sheet.title}</Text>
          {sheet.message ? <Text style={styles.message}>{sheet.message}</Text> : null}
          {sheet.options.map((o) => (
            <Pressable
              key={o.label}
              onPress={() => {
                hide();
                o.onPress();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              {o.icon ? <Ionicons name={o.icon} size={20} color={o.destructive ? colors.danger : colors.primary} /> : null}
              <Text style={[styles.optionText, o.destructive && { color: colors.danger }]}>{o.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={hide} style={({ pressed }) => [styles.option, styles.cancel, pressed && styles.pressed]}>
            <Text style={[styles.optionText, styles.cancelText]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, paddingHorizontal: 12, paddingTop: 8, gap: 2 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, paddingHorizontal: 8 },
  message: { fontSize: 14, color: colors.muted, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, height: 52, borderRadius: radius.md },
  pressed: { backgroundColor: colors.bg },
  optionText: { fontSize: 16, color: colors.text, fontWeight: '500' },
  cancel: { justifyContent: 'center', marginTop: 4 },
  cancelText: { color: colors.muted, fontWeight: '600', textAlign: 'center', flex: 1 },
});
