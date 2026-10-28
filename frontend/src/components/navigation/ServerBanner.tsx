// A banner across the top when the app has lost the server for a while, saying why and where to fix it.
// The server runs on the laptop: if the laptop is off, asleep or offline, nothing that needs it can work
// (live calls, roles, the team...).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLive } from '@/state/liveStore';
import { colors } from '@/theme';

const GRACE_MS = 10_000; // brief drops (switching networks) reconnect by themselves

export function ServerBanner() {
  const connected = useLive((s) => s.connected);
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (connected) return setShow(false);
    const t = setTimeout(() => setShow(true), GRACE_MS);
    return () => clearTimeout(t);
  }, [connected]);

  if (!show) return null;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
      <Pressable onPress={() => router.push('/preferences/server')} style={styles.banner} accessibilityRole="button">
        <Ionicons name="cloud-offline" size={18} color="#fff" />
        <View style={styles.flex}>
          <Text style={styles.title}>Can’t reach the server</Text>
          <Text style={styles.text}>It runs on the laptop: keep it switched on and online (the lid can be closed). Tap to check the address.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 10 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.danger, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
  flex: { flex: 1 },
  title: { color: '#fff', fontWeight: '700', fontSize: 14 },
  text: { color: '#FEE2E2', fontSize: 12, lineHeight: 16, marginTop: 1 },
});
