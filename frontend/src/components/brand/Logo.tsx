// The Agentic Call mark: a speech bubble with a voice waveform and AI sparkles. Drawn from the same 100-unit
// geometry as the app icon (frontend/assets/icon.png), so the icon, the launch screen and the app match.
import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

export const BRAND = { indigo: '#4F46E5', light: '#766CFF', deep: '#3A31C4', amber: '#FBBF24' };

const SPARKLE = require('../../../assets/sparkle.png'); // the amber four-point star, same drawing as the app icon

const BARS: [number, number][] = [
  [24, 14],
  [35, 28],
  [46, 40],
  [57, 24],
  [68, 12],
];
const BAR_PERIODS = [520, 660, 440, 600, 500]; // ms per half-wave, so the bars never move in step
const STARS: { x: number; y: number; r: number }[] = [
  { x: 80, y: 20, r: 14 },
  { x: 92, y: 46, r: 6.5 },
];

/** The mark on a transparent square `size` px wide. With `animated` the waveform plays and the sparkles twinkle. */
export const LogoMark = memo(function LogoMark({ size, animated = false }: { size: number; animated?: boolean }) {
  const u = size / 100;
  const bars = useRef(BARS.map(() => new Animated.Value(1))).current; // 0 = shortest, 1 = resting height
  const twinkle = useRef(STARS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (!animated) return;
    const loops = [
      ...bars.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 0, duration: BAR_PERIODS[i], easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
            Animated.timing(v, { toValue: 1.15, duration: BAR_PERIODS[i], easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          ]),
        ),
      ),
      ...twinkle.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 350),
            Animated.timing(v, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(v, { toValue: 1.15, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animated, bars, twinkle]);

  return (
    <View style={{ width: size, height: size }}>
      {/* soft shadow under the bubble */}
      <View style={[bubbleStyle(u), { top: 23 * u, backgroundColor: 'rgba(20,12,110,0.28)' }]} />
      <View style={[bubbleStyle(u), { top: 20 * u, backgroundColor: '#fff' }]} />
      <View style={[tailStyle(u), { top: 62.9 * u }]} />
      {BARS.map(([cx, h], i) => (
        // A fixed-height lane keeps the bar centred; only the inner bar's height changes, so its ends stay round
        <View key={i} style={{ position: 'absolute', left: (cx - 3.5) * u, top: (45 - h * 0.6) * u, width: 7 * u, height: h * 1.2 * u, justifyContent: 'center', alignItems: 'center' }}>
          <Animated.View
            style={{
              width: 7 * u,
              borderRadius: 3.5 * u,
              backgroundColor: BRAND.indigo,
              height: bars[i].interpolate({ inputRange: [0, 1], outputRange: [Math.max(7, h * 0.4) * u, h * u] }),
            }}
          />
        </View>
      ))}
      {STARS.map((s, i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: (s.x - s.r) * u, top: (s.y - s.r) * u, width: 2 * s.r * u, height: 2 * s.r * u, transform: [{ scale: twinkle[i] }] }}>
          <Image source={SPARKLE} style={{ width: 2 * s.r * u, height: 2 * s.r * u }} />
        </Animated.View>
      ))}
    </View>
  );
});

const bubbleStyle = (u: number) =>
  ({ position: 'absolute', left: 10 * u, width: 72 * u, height: 50 * u, borderRadius: 20 * u }) as const;

// The bubble's tail: a rounded square turned 45°, centred on the bubble's lower-left edge (half hidden by the bubble)
const tailStyle = (u: number) =>
  ({ position: 'absolute', width: 14.14 * u, height: 14.14 * u, left: 22.9 * u, backgroundColor: '#fff', borderRadius: 1.5 * u, transform: [{ rotate: '45deg' }] }) as const;

/** The app icon as a rounded tile, for headers and the sign-in screen. */
export function Logo({ size = 72 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.225, backgroundColor: BRAND.indigo, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', elevation: 4, shadowColor: BRAND.indigo, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
      <View style={{ position: 'absolute', top: -size * 0.35, left: -size * 0.25, width: size * 1.0, height: size * 0.9, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.12)' }} />
      <View style={{ marginLeft: -size * 0.035, marginTop: -size * 0.02 }}>
        <LogoMark size={size * 0.78} />
      </View>
    </View>
  );
}
