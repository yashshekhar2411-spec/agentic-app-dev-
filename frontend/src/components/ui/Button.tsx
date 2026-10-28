import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.base, styles[variant], (pressed || off) && styles.dim, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.danger },
  dim: { opacity: 0.6 },
  label: { color: '#fff', fontWeight: '600', fontSize: 15 },
  labelSecondary: { color: colors.primary },
});
