// − value + control for small numeric settings (hours, seconds, turns)
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  wrap?: boolean; // e.g. hours: 23 + 1 -> 0
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Stepper({ value, onChange, min, max, step = 1, wrap, format = String, disabled }: Props) {
  const move = (dir: 1 | -1) => {
    let next = value + dir * step;
    if (wrap) next = next > max ? min : next < min ? max : next;
    onChange(Math.min(max, Math.max(min, next)));
  };
  const canDown = wrap || value > min;
  const canUp = wrap || value < max;
  return (
    <View style={[styles.row, disabled && styles.off]}>
      <Pressable onPress={() => move(-1)} disabled={disabled || !canDown} hitSlop={8} style={styles.btn}>
        <Ionicons name="remove" size={18} color={canDown ? colors.primary : colors.border} />
      </Pressable>
      <Text style={styles.value}>{format(value)}</Text>
      <Pressable onPress={() => move(1)} disabled={disabled || !canUp} hitSlop={8} style={styles.btn}>
        <Ionicons name="add" size={18} color={canUp ? colors.primary : colors.border} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.pill, padding: 3 },
  off: { opacity: 0.4 },
  btn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  value: { minWidth: 70, textAlign: 'center', fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
});
