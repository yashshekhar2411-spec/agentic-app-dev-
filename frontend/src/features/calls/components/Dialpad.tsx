// Phone-style keypad. Long-press 0 for +, long-press ⌫ to clear.
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { colors } from '@/theme';

const KEYS: [string, string][] = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
];

interface Props {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  canDelete: boolean;
}

const tap = () => Vibration.vibrate(8);

export const Dialpad = memo(function Dialpad({ onKey, onBackspace, onClear, canDelete }: Props) {
  const press = (key: string) => {
    tap();
    onKey(key);
  };
  return (
    <View style={styles.pad}>
      {KEYS.map(([digit, letters]) => (
        <Key key={digit} digit={digit} letters={letters} onPress={() => press(digit)} />
      ))}
      <View style={styles.key} />
      <Key digit="0" letters="+" onPress={() => press('0')} onLongPress={() => press('+')} />
      <Pressable
        onPress={() => (tap(), onBackspace())}
        onLongPress={() => (Vibration.vibrate(20), onClear())}
        disabled={!canDelete}
        style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        accessibilityLabel="Delete"
      >
        <Ionicons name="backspace-outline" size={26} color={canDelete ? colors.text : colors.border} />
      </Pressable>
    </View>
  );
});

function Key({ digit, letters, onPress, onLongPress }: { digit: string; letters: string; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.key, styles.round, pressed && styles.pressed]}>
      <Text style={styles.digit}>{digit}</Text>
      <Text style={styles.letters}>{letters || ' '}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingHorizontal: 12 },
  key: { width: '30%', height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 31 },
  round: { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { backgroundColor: colors.primarySoft },
  digit: { fontSize: 26, fontWeight: '500', color: colors.text, lineHeight: 30 },
  letters: { fontSize: 10, fontWeight: '600', color: colors.muted, letterSpacing: 1.5 },
});
