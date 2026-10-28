// The launch screen. The system's native splash (same indigo, same mark, same position) hands over to this one,
// which plays the waveform, slides the name in, then fades away once the app is ready.
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

import { BRAND, LogoMark } from './Logo';

const MARK = 184; // matches splashscreen_logo.png in the native project
const MIN_SHOW_MS = 1900;
const { width: W, height: H } = Dimensions.get('window');

interface Props {
  ready: boolean; // the app behind it has loaded
  onDone: () => void;
}

export function Splash({ ready, onDone }: Props) {
  const started = useRef(Date.now()).current;
  const fade = useRef(new Animated.Value(1)).current; // the whole screen
  const lift = useRef(new Animated.Value(0)).current; // 0 → 1 as the name appears
  const tagline = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const exiting = useRef(false);

  useEffect(() => {
    const intro = Animated.sequence([
      Animated.delay(350),
      Animated.timing(lift, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tagline, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    const loops = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(drift, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ]);
    intro.start();
    loops.start();
    return () => {
      intro.stop();
      loops.stop();
    };
  }, [lift, tagline, breathe, drift]);

  // Leave once the app is ready, but never flash by: show it for at least MIN_SHOW_MS
  useEffect(() => {
    if (!ready || exiting.current) return;
    exiting.current = true;
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - started));
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(onDone);
    }, wait);
    return () => clearTimeout(t);
  }, [ready, started, fade, onDone]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const exitScale = fade.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] }); // grows slightly as it leaves
  const blobShift = drift.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] });

  return (
    <Animated.View style={[styles.fill, { opacity: fade }]} pointerEvents={ready ? 'none' : 'auto'}>
      <Animated.View style={[styles.blob, styles.blobTop, { transform: [{ translateY: blobShift }] }]} />
      <Animated.View style={[styles.blob, styles.blobBottom, { transform: [{ translateY: Animated.multiply(blobShift, -1) }] }]} />

      <Animated.View style={[styles.center, { transform: [{ scale: exitScale }] }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <LogoMark size={MARK} animated />
        </Animated.View>
        <Animated.Text
          style={[styles.name, { opacity: lift, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}
        >
          Agentic Call
        </Animated.Text>
        <Animated.Text style={[styles.tagline, { opacity: tagline }]}>Every call, answered.</Animated.Text>
      </Animated.View>

      <View style={styles.footer}>
        <Animated.Text style={[styles.footerText, { opacity: tagline }]}>AI voice agents · human handover</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.indigo, alignItems: 'center', justifyContent: 'center' },
  // The mark sits exactly at the screen's centre (like the native splash); the name hangs below it
  center: { alignItems: 'center', justifyContent: 'center' },
  name: { position: 'absolute', top: MARK + 18, fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  tagline: { position: 'absolute', top: MARK + 62, fontSize: 15, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.3 },
  blob: { position: 'absolute', width: W * 1.1, height: W * 1.1, borderRadius: W, backgroundColor: 'rgba(255,255,255,0.07)' },
  blobTop: { top: -W * 0.55, right: -W * 0.45 },
  blobBottom: { bottom: -W * 0.6, left: -W * 0.5, backgroundColor: 'rgba(58,49,196,0.45)' },
  footer: { position: 'absolute', bottom: Math.max(36, H * 0.05), alignItems: 'center' },
  footerText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8 },
});
