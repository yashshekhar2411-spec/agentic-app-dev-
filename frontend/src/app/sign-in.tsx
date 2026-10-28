// Firebase sign-in: Google or email/password. Everything else in the app sits behind this screen.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand/Logo';
import { refreshAuthUser } from '@/features/auth/store';
import { EMAIL_IN_USE, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail, type AuthError } from '@/services/auth/firebase';
import { colors, radius } from '@/theme';

type Mode = 'sign-in' | 'sign-up';
type FieldName = 'name' | 'email' | 'password';
type Banner = { kind: 'error' | 'info'; text: string; action?: { label: string; onPress: () => void } };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_BLUE = '#4285F4';
const HERO = '#312E81'; // deep indigo behind the brand
const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'sparkles', label: 'AI answers first' },
  { icon: 'flash', label: 'Live handoffs' },
  { icon: 'shield-checkmark', label: 'Secure' },
];

/** Fades and slides content in after `delay` ms (screen entrance). */
function useEntrance(delay: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };
}

/** Scales a pressable down slightly while held. */
function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return { scale, onPressIn: () => to(0.97), onPressOut: () => to(1) };
}

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [banner, setBanner] = useState<Banner | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const hero = useEntrance(0);
  const sheet = useEntrance(120);
  const signUp = mode === 'sign-up';

  const switchMode = (next: Mode) => {
    if (next === mode || busy) return;
    setMode(next);
    setErrors({});
    setBanner(null);
  };

  const run = async (kind: 'google' | 'email', action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(kind);
    setBanner(null);
    try {
      await action(); // on success the auth listener swaps this screen for the app
    } catch (e) {
      const err = e as AuthError;
      setBanner(
        err.code === EMAIL_IN_USE
          ? // Offer the obvious next step instead of a dead end; keep what they typed
            { kind: 'error', text: err.message, action: { label: 'Sign in instead', onPress: () => switchMode('sign-in') } }
          : { kind: 'error', text: err.message },
      );
    } finally {
      setBusy(null);
    }
  };

  const validate = () => {
    const next: typeof errors = {};
    if (signUp && !name.trim()) next.name = 'Enter the name your teammates will see';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address';
    if (password.length < 6) next.password = 'At least 6 characters';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitEmail = () => {
    if (!validate()) return;
    void run('email', async () => {
      if (!signUp) return signInWithEmail(email, password);
      await signUpWithEmail(name, email, password);
      refreshAuthUser(); // pick up the display name, which is saved just after the account is created
    });
  };

  const forgot = async () => {
    if (!EMAIL.test(email.trim())) {
      setErrors({ email: 'Enter your email first, then tap “Forgot password?”' });
      emailRef.current?.focus();
      return;
    }
    try {
      await resetPassword(email);
      setBanner({ kind: 'info', text: `Reset link sent to ${email.trim()}. Check your inbox.` });
    } catch (e) {
      Alert.alert("Couldn't send the reset email", (e as Error).message);
    }
  };

  const clearError = (field: FieldName) => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero: brand on a deep indigo backdrop with soft glow shapes */}
        <View style={styles.hero}>
          <View style={[styles.glow, styles.glowA]} />
          <View style={[styles.glow, styles.glowB]} />
          <View style={[styles.glow, styles.glowC]} />
          <SafeAreaView edges={['top']}>
            <Animated.View style={[styles.brand, hero]}>
              <View style={styles.logoRing}>
                <Logo size={72} />
              </View>
              <Text style={styles.title}>Agentic Call</Text>
              <Text style={styles.subtitle}>Step in the moment the AI needs a human.</Text>
              <View style={styles.features}>
                {FEATURES.map((f) => (
                  <View key={f.label} style={styles.feature}>
                    <Ionicons name={f.icon} size={13} color="#C7D2FE" />
                    <Text style={styles.featureText}>{f.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </SafeAreaView>
        </View>

        {/* The card overlaps the hero; both live in one scroll view so nothing clips it */}
        <Animated.View style={[styles.sheet, sheet]}>
          <Text style={styles.heading}>{signUp ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.subheading}>
            {signUp ? 'Set up your agent account in seconds.' : 'Sign in to see live calls and take handoffs.'}
          </Text>

          <GoogleButton loading={busy === 'google'} disabled={!!busy} onPress={() => run('google', signInWithGoogle)} />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.or}>or use email</Text>
            <View style={styles.divider} />
          </View>

          <Segmented mode={mode} onChange={switchMode} />

          {banner ? (
            <View style={[styles.banner, banner.kind === 'error' ? styles.bannerError : styles.bannerInfo]}>
              <Ionicons
                name={banner.kind === 'error' ? 'alert-circle' : 'mail-unread'}
                size={18}
                color={banner.kind === 'error' ? colors.danger : colors.success}
              />
              <View style={styles.flex}>
                <Text style={[styles.bannerText, { color: banner.kind === 'error' ? colors.danger : colors.success }]}>
                  {banner.text}
                </Text>
                {banner.action ? (
                  <Pressable onPress={banner.action.onPress} hitSlop={8} accessibilityRole="button" style={styles.bannerAction}>
                    <Text style={styles.bannerActionText}>{banner.action.label}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {signUp ? (
            <Field
              icon="person-outline"
              placeholder="Full name"
              value={name}
              onChangeText={(t) => {
                setName(t);
                clearError('name');
              }}
              error={errors.name}
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          ) : null}
          <Field
            ref={emailRef}
            icon="mail-outline"
            placeholder="Work email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError('email');
            }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Field
            ref={passwordRef}
            icon="lock-closed-outline"
            placeholder="Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError('password');
            }}
            error={errors.password}
            secureTextEntry={!showPassword}
            autoComplete={signUp ? 'new-password' : 'current-password'}
            returnKeyType="go"
            onSubmitEditing={submitEmail}
            trailing={
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
              </Pressable>
            }
          />

          {!signUp ? (
            <Pressable onPress={forgot} style={styles.forgot} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          ) : null}

          <PrimaryButton title={signUp ? 'Create account' : 'Sign in'} loading={busy === 'email'} disabled={!!busy} onPress={submitEmail} />

          <View style={styles.secure}>
            <Ionicons name="lock-closed" size={12} color={colors.muted} />
            <Text style={styles.secureText}>Secured by Firebase Authentication</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GoogleButton({ onPress, loading, disabled }: { onPress: () => void; loading: boolean; disabled: boolean }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={[styles.googleShadow, { transform: [{ scale }] }, disabled && !loading && styles.dim]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        android_ripple={{ color: '#E8EAED' }}
        style={styles.google}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ busy: loading, disabled }}
      >
        <View style={styles.googleBadge}>
          {loading ? <ActivityIndicator size="small" color={GOOGLE_BLUE} /> : <Ionicons name="logo-google" size={18} color={GOOGLE_BLUE} />}
        </View>
        <Text style={styles.googleText}>{loading ? 'Connecting to Google…' : 'Continue with Google'}</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

function PrimaryButton({ title, onPress, loading, disabled }: { title: string; onPress: () => void; loading: boolean; disabled: boolean }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={[styles.primaryShadow, { transform: [{ scale }] }, disabled && !loading && styles.dim]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        android_ripple={{ color: '#6366F1' }}
        style={styles.primary}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled }}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
      </Pressable>
    </Animated.View>
  );
}

/** Sign in / Create account switch with a sliding indicator. */
function Segmented({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(mode === 'sign-in' ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: mode === 'sign-in' ? 0 : 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [mode, x]);
  const half = (width - 8) / 2;
  return (
    <View style={styles.segment} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {width > 0 ? (
        <Animated.View
          style={[styles.segmentThumb, { width: half, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] }]}
        />
      ) : null}
      {(['sign-in', 'sign-up'] as const).map((m) => (
        <Pressable key={m} style={styles.segmentItem} onPress={() => onChange(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
          <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>{m === 'sign-in' ? 'Sign in' : 'Create account'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type FieldProps = TextInputProps & {
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  trailing?: React.ReactNode;
  ref?: React.Ref<TextInput>;
};

/** Text input with a leading icon, focus ring and inline error. */
function Field({ icon, error, trailing, ref, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const tint = error ? colors.danger : focused ? colors.primary : colors.muted;
  return (
    <View style={styles.fieldWrap}>
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        <Ionicons name={icon} size={19} color={tint} />
        <TextInput
          ref={ref}
          placeholderTextColor="#9CA3AF"
          style={styles.input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
        {trailing}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const shadow = (color: string, opacity: number, blur: number, elevation: number) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: blur,
  shadowOffset: { width: 0, height: 6 },
  elevation,
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  hero: { backgroundColor: HERO, paddingBottom: 56, overflow: 'hidden' },
  glow: { position: 'absolute', borderRadius: 999 },
  glowA: { width: 260, height: 260, top: -90, right: -70, backgroundColor: '#4F46E5', opacity: 0.55 },
  glowB: { width: 200, height: 200, bottom: -80, left: -60, backgroundColor: '#7C3AED', opacity: 0.45 },
  glowC: { width: 90, height: 90, top: 70, left: 40, backgroundColor: '#818CF8', opacity: 0.25 },
  brand: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 24, gap: 8 },
  logoRing: { padding: 6, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.14)', marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  subtitle: { fontSize: 15, color: '#C7D2FE', textAlign: 'center' },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  featureText: { color: '#E0E7FF', fontSize: 12, fontWeight: '600' },

  scroll: { flexGrow: 1, paddingBottom: 32 },
  sheet: {
    marginTop: -36,
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 22,
    gap: 14,
    ...shadow('#1E1B4B', 0.12, 24, 6),
  },
  heading: { fontSize: 22, fontWeight: '800', color: colors.text },
  subheading: { fontSize: 14, color: colors.muted, marginTop: -8 },

  googleShadow: { borderRadius: radius.md, ...shadow('#000', 0.08, 10, 3) },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DADCE0',
    overflow: 'hidden',
  },
  googleBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5FE', alignItems: 'center', justifyContent: 'center' },
  googleText: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1F1F1F' },
  dim: { opacity: 0.55 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },

  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: '#F1F2F6' },
  segmentThumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 9, backgroundColor: '#fff', ...shadow('#000', 0.08, 6, 2) },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.text },

  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.md },
  bannerError: { backgroundColor: '#FEF2F2' },
  bannerInfo: { backgroundColor: '#ECFDF5' },
  bannerText: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  bannerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  bannerActionText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  fieldWrap: { gap: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#FAFAFC',
  },
  fieldFocused: { borderColor: colors.primary, backgroundColor: '#fff' },
  fieldError: { borderColor: colors.danger, backgroundColor: '#FFFBFB' },
  input: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text },
  errorText: { fontSize: 12, color: colors.danger, marginLeft: 4 },

  forgot: { alignSelf: 'flex-end', marginTop: -6 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  primaryShadow: { borderRadius: radius.md, ...shadow(colors.primary, 0.35, 12, 5) },
  primary: { paddingVertical: 15, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', overflow: 'hidden' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  secureText: { fontSize: 12, color: colors.muted },
});
