// The buttons in the top bar of the main screens: three lines on the left, "new call" on the right.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { openDrawer } from './drawer';

export function MenuButton() {
  return (
    <Pressable onPress={openDrawer} hitSlop={10} style={({ pressed }) => [styles.button, styles.left, pressed && styles.pressed]} accessibilityLabel="Open menu">
      <Ionicons name="menu" size={28} color={colors.text} />
    </Pressable>
  );
}

export function NewCallButton() {
  return (
    <Pressable onPress={() => router.navigate('/dial')} hitSlop={10} style={({ pressed }) => [styles.button, styles.right, pressed && styles.pressed]} accessibilityLabel="New call">
      <Ionicons name="create-outline" size={25} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 6, borderRadius: 20 },
  left: { marginLeft: 8 },
  right: { marginRight: 8 },
  pressed: { backgroundColor: '#00000010' },
});
