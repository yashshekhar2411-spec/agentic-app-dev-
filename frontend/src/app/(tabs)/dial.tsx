// Call tab: dial a number and the AI calls it; redial from recents.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Elapsed } from '@/components/ui/Elapsed';
import { CountryPicker } from '@/features/calls/components/CountryPicker';
import { Dialpad } from '@/features/calls/components/Dialpad';
import { RecentCalls } from '@/features/calls/components/RecentCalls';
import { useStartCall } from '@/features/calls/hooks/useStartCall';
import { useContacts } from '@/features/contacts/store';
import { usePreferences } from '@/features/settings/store';
import { selectActiveCalls, useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import { formatPhone, groupLocal, isE164, toE164 } from '@/utils/phone';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

const MAX_DIGITS = 15;

function DialScreen() {
  const defaultCode = usePreferences((s) => s.countryCode);
  const topics = usePreferences((s) => s.callTopics);
  const [countryCode, setCountryCode] = useState(defaultCode);
  useEffect(() => setCountryCode(defaultCode), [defaultCode]); // changed in Settings, or loaded from storage
  const [digits, setDigits] = useState(''); // what was dialled: local digits, or a full +number
  const [purpose, setPurpose] = useState('');
  const { start, busy } = useStartCall();
  const live = useLive(useShallow((s) => selectActiveCalls(s)));
  const favorites = useContacts(useShallow((s) => Object.values(s.byNumber).filter((c) => c.favorite && !c.blocked)));

  const to = toE164(countryCode, digits);
  const valid = isE164(to);
  const contact = useContacts((s) => (valid ? s.byNumber[to] : undefined));
  const blocked = !!contact?.blocked;
  const canSchedule = useCan('scheduling.create');
  const canCampaign = useCan('scheduling.campaigns');
  const shown = digits.startsWith('+') ? formatPhone(digits) : groupLocal(digits, countryCode);

  const type = (key: string) =>
    setDigits((d) => {
      if (key === '+') return d ? d : '+'; // only as the first character
      return d.replace(/\D/g, '').length >= MAX_DIGITS ? d : d + key;
    });
  // Pasted or typed text: keep digits and a leading +
  const paste = (text: string) => {
    const cleaned = text.replace(/[^\d+]/g, '');
    setDigits(cleaned.startsWith('+') ? '+' + cleaned.slice(1).replace(/\+/g, '') : cleaned.replace(/\+/g, ''));
  };

  const call = (number = to, about = purpose) => {
    if (!isE164(number)) return;
    start(number, about, () => setDigits(''));
  };

  // From recents: redial with what the AI called about last time
  const redial = (number: string, about: string) => {
    setPurpose(about);
    call(number, about);
  };

  const color = colors.ai;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {live.map((c) => (
          <Pressable key={c.id} onPress={() => router.push(`/call/${c.id}`)} style={({ pressed }) => [styles.liveBar, pressed && styles.pressed]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText} numberOfLines={1}>
              {c.direction === 'inbound' ? 'AI is talking with ' : 'AI is calling '}
              {formatPhone(c.fromNumber)}
            </Text>
            <Elapsed since={c.startedAt} style={styles.liveTimer} />
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </Pressable>
        ))}

        <View style={styles.display}>
          <CountryPicker code={countryCode} onChange={setCountryCode} />
          <TextInput
            value={shown}
            onChangeText={paste}
            placeholder="Enter number"
            placeholderTextColor={colors.border}
            style={[styles.number, shown.length > 13 && { fontSize: 24 }]}
            showSoftInputOnFocus={false} // the dialpad types; long-press still pastes
            caretHidden
            selectTextOnFocus={false}
          />
        </View>
        <Text style={[styles.hint, ((digits && !valid) || blocked) && styles.bad]}>
          {!digits
            ? ' '
            : !valid
              ? 'Keep typing: that number is too short'
              : blocked
                ? `${contact?.name || formatPhone(to)} is on the do-not-call list`
                : `Will call ${contact?.name ? `${contact.name} · ` : ''}${formatPhone(to)}`}
        </Text>

        {favorites.length && !digits ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {favorites.map((c) => (
              <Pressable key={c.number} style={styles.fav} onPress={() => setDigits(c.number)}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.favText}>{c.name || formatPhone(c.number)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.about}>
            <TextInput
              value={purpose}
              onChangeText={setPurpose}
              placeholder="What should the AI call about? (optional)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={500}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {topics.map((p) => (
                <Pressable key={p} style={[styles.chip, purpose === p && styles.chipOn]} onPress={() => setPurpose(purpose === p ? '' : p)}>
                  <Text style={[styles.chipText, purpose === p && styles.chipTextOn]}>{p}</Text>
                </Pressable>
              ))}
            </ScrollView>
        </View>

        <Dialpad onKey={type} onBackspace={() => setDigits((d) => d.slice(0, -1))} onClear={() => setDigits('')} canDelete={!!digits} />

        <View style={styles.actions}>
          <SideAction icon="alarm-outline" label="Schedule" disabled={!valid || blocked || !canSchedule} onPress={() => router.push({ pathname: '/schedule', params: { to, purpose } })} />
          <View style={styles.callRow}>
            <Pressable
              onPress={() => call()}
              disabled={!valid || busy || blocked}
              style={({ pressed }) => [styles.callButton, { backgroundColor: color }, (!valid || blocked || pressed) && styles.dim]}
              accessibilityLabel="Call with AI"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={28} color="#fff" />}
            </Pressable>
            <Text style={[styles.callLabel, { color }]}>{busy ? 'Calling…' : 'Call with AI'}</Text>
          </View>
          <SideAction icon="megaphone-outline" label="Campaign" disabled={!canCampaign} onPress={() => router.push({ pathname: '/schedule', params: { purpose } })} />
        </View>

        <RecentCalls onRedial={redial} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SideAction({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.side, (disabled || pressed) && styles.dim]} accessibilityLabel={label}>
      <View style={styles.sideIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.sideLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  pressed: { opacity: 0.8 },
  liveBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.success, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { flex: 1, color: '#fff', fontWeight: '600', fontSize: 14 },
  liveTimer: { color: '#fff', fontWeight: '600', fontVariant: ['tabular-nums'] },
  display: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  number: { flex: 1, fontSize: 30, fontWeight: '500', color: colors.text, letterSpacing: 0.5, paddingVertical: 4, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13, color: colors.success, marginTop: -8 },
  bad: { color: colors.warning },
  about: { gap: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  chips: { gap: 8, paddingRight: 8 },
  chip: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontWeight: '500', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  actions: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-evenly', marginTop: 4 },
  callRow: { alignItems: 'center', gap: 6 },
  side: { alignItems: 'center', gap: 6, width: 80, paddingTop: 10 },
  sideIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sideLabel: { fontSize: 12, fontWeight: '600', color: colors.primary },
  fav: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  favText: { color: colors.text, fontWeight: '500', fontSize: 13 },
  callButton: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  dim: { opacity: 0.45 },
  callLabel: { fontSize: 13, fontWeight: '600' },
});

export default function DialScreenRoute() {
  return (
    <Gate perm="dialer.call">
      <DialScreen />
    </Gate>
  );
}
