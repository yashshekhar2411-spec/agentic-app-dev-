// Schedule AI calls: one number is a callback; paste many and the AI works through them as a campaign.
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { CountryPicker } from '@/features/calls/components/CountryPicker';
import { useContacts } from '@/features/contacts/store';
import { scheduleCalls } from '@/features/schedule/api';
import { useSchedule, whenLabel } from '@/features/schedule/store';
import { usePreferences } from '@/features/settings/store';
import { colors, radius } from '@/theme';
import { formatPhone, isE164, toE164 } from '@/utils/phone';
import { Gate } from '@/features/rbac/components/Gate';

const DAYS = ['Today', 'Tomorrow', 'In 2 days'];
const QUICK = [
  { label: 'Now', mins: 0 },
  { label: '15 min', mins: 15 },
  { label: '1 hour', mins: 60 },
  { label: '3 hours', mins: 180 },
];
const SPACING = [
  { label: '30 s', s: 30 },
  { label: '1 min', s: 60 },
  { label: '2 min', s: 120 },
  { label: '5 min', s: 300 },
];

type When = { kind: 'quick'; mins: number } | { kind: 'at'; day: number; time: string };

/** "14:30", "2:30 pm", "9" → [hours, minutes] in 24h, or null. */
function parseTime(text: string): [number, number] | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return h < 24 && min < 60 ? [h, min] : null;
}

function startTime(when: When): Date | null {
  if (when.kind === 'quick') return new Date(Date.now() + when.mins * 60_000);
  const t = parseTime(when.time);
  if (!t) return null;
  const d = new Date();
  d.setDate(d.getDate() + when.day);
  d.setHours(t[0], t[1], 0, 0);
  return d;
}

function ScheduleScreen() {
  const params = useLocalSearchParams<{ to?: string; purpose?: string }>();
  const defaultCode = usePreferences((s) => s.countryCode);
  const topics = usePreferences((s) => s.callTopics);
  const favorites = useContacts(useShallow((s) => Object.values(s.byNumber).filter((c) => c.favorite && !c.blocked)));
  const blocked = useContacts((s) => s.byNumber);
  const [countryCode, setCountryCode] = useState(defaultCode);
  const [text, setText] = useState(params.to ?? '');
  const [purpose, setPurpose] = useState(params.purpose ?? '');
  const [name, setName] = useState('');
  const [when, setWhen] = useState<When>({ kind: 'quick', mins: params.to ? 60 : 0 });
  const [spacing, setSpacing] = useState(60);
  const [busy, setBusy] = useState(false);

  // One number per line (or comma / semicolon separated); spaces inside a number are fine
  const parsed = useMemo(() => {
    const parts = text.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
    const numbers: string[] = [];
    const bad: string[] = [];
    for (const p of parts) {
      const n = toE164(countryCode, p);
      if (!isE164(n)) bad.push(p);
      else if (!numbers.includes(n)) numbers.push(n);
    }
    return { numbers, bad, skipped: numbers.filter((n) => blocked[n]?.blocked) };
  }, [text, countryCode, blocked]);

  const callable = parsed.numbers.filter((n) => !parsed.skipped.includes(n));
  const campaign = callable.length > 1;
  const first = startTime(when);
  const last = first && campaign ? new Date(first.getTime() + (callable.length - 1) * spacing * 1000) : null;

  const addNumber = (n: string) => setText((t) => (t.includes(n) ? t : t.trim() ? `${t.trim()}\n${n}` : n));

  const submit = async () => {
    if (!first || !callable.length) return;
    setBusy(true);
    try {
      const items = await scheduleCalls({ numbers: callable, purpose: purpose.trim(), runAt: first.toISOString(), spacingS: spacing, name: name.trim() });
      useSchedule.getState().upsert(...items);
      router.replace('/scheduled');
    } catch (e) {
      Alert.alert("Couldn't schedule", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Who to call">
          <View style={styles.row}>
            <CountryPicker code={countryCode} onChange={setCountryCode} />
            <Text style={styles.hint}>for numbers typed without a +</Text>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={'One number per line, e.g.\n98765 43210\n+14155550100'}
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.numbers]}
            multiline
            textAlignVertical="top"
            keyboardType="phone-pad"
          />
          {favorites.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {favorites.map((c) => (
                <Pressable key={c.number} onPress={() => addNumber(c.number)} style={styles.chip}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.chipText}>{c.name || formatPhone(c.number)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Text style={[styles.hint, parsed.bad.length > 0 && styles.warn]}>
            {callable.length} {callable.length === 1 ? 'number' : 'numbers'}
            {parsed.skipped.length ? ` · ${parsed.skipped.length} on do-not-call skipped` : ''}
            {parsed.bad.length ? ` · not numbers: ${parsed.bad.slice(0, 3).join(', ')}${parsed.bad.length > 3 ? '…' : ''}` : ''}
          </Text>
        </Section>

        {campaign ? (
          <Section title="Campaign name">
            <TextInput value={name} onChangeText={setName} placeholder="e.g. November renewals" placeholderTextColor={colors.muted} style={styles.input} maxLength={80} />
          </Section>
        ) : null}

        <Section title="What the AI calls about">
          <TextInput value={purpose} onChangeText={setPurpose} placeholder="optional" placeholderTextColor={colors.muted} style={styles.input} maxLength={500} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {topics.map((t) => (
              <Pressable key={t} onPress={() => setPurpose(purpose === t ? '' : t)} style={[styles.chip, purpose === t && styles.chipOn]}>
                <Text style={[styles.chipText, purpose === t && styles.chipTextOn]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>

        <Section title={campaign ? 'First call' : 'When'}>
          <View style={styles.wrap}>
            {QUICK.map((q) => {
              const on = when.kind === 'quick' && when.mins === q.mins;
              return (
                <Pressable key={q.label} onPress={() => setWhen({ kind: 'quick', mins: q.mins })} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{q.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.wrap}>
            {DAYS.map((d, i) => {
              const on = when.kind === 'at' && when.day === i;
              return (
                <Pressable key={d} onPress={() => setWhen({ kind: 'at', day: i, time: when.kind === 'at' ? when.time : '10:00' })} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          {when.kind === 'at' ? (
            <View style={styles.row}>
              <Text style={styles.label}>at</Text>
              <TextInput
                value={when.time}
                onChangeText={(time) => setWhen({ ...when, time })}
                placeholder="10:00 or 4:30 pm"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.flex]}
              />
            </View>
          ) : null}
          <Text style={[styles.hint, !first && styles.warn]}>
            {!first ? 'Type a time like 10:00, 16:30 or 4:30 pm' : first.getTime() < Date.now() - 60_000 ? 'That time has passed: the call goes out right away' : `Starts ${whenLabel(first.toISOString())}`}
            {last ? `, last call about ${whenLabel(last.toISOString())}` : ''}
          </Text>
        </Section>

        {campaign ? (
          <Section title="Gap between calls">
            <View style={styles.wrap}>
              {SPACING.map((o) => (
                <Pressable key={o.s} onPress={() => setSpacing(o.s)} style={[styles.chip, spacing === o.s && styles.chipOn]}>
                  <Text style={[styles.chipText, spacing === o.s && styles.chipTextOn]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>The AI makes one call at a time, in the order above.</Text>
          </Section>
        ) : null}

        <Button
          title={campaign ? `Schedule ${callable.length} calls` : 'Schedule call'}
          onPress={submit}
          disabled={!callable.length || !first}
          loading={busy}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  numbers: { minHeight: 110, fontVariant: ['tabular-nums'] },
  label: { fontSize: 15, color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  warn: { color: colors.warning },
  chips: { gap: 8, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontWeight: '500', fontSize: 13 },
  chipTextOn: { color: '#fff' },
});

export default function ScheduleScreenRoute() {
  return (
    <Gate perm="scheduling.create">
      <ScheduleScreen />
    </Gate>
  );
}
