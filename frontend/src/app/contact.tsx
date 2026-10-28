// One contact: name, company, notes, favourite and do-not-call, plus every call with them. Without a number: a new contact.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { CallCard } from '@/features/calls/components/CallCard';
import { askCallback } from '@/features/calls/components/CallActions';
import { CountryPicker } from '@/features/calls/components/CountryPicker';
import { useStartCall } from '@/features/calls/hooks/useStartCall';
import { removeContact, updateContact, useContacts } from '@/features/contacts/store';
import { usePreferences } from '@/features/settings/store';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import { formatPhone, isE164, toE164 } from '@/utils/phone';
import { formatSeconds } from '@/utils/time';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

function ContactScreen() {
  const params = useLocalSearchParams<{ number?: string }>();
  const defaultCode = usePreferences((s) => s.countryCode);
  const [countryCode, setCountryCode] = useState(defaultCode);
  const [typed, setTyped] = useState('');
  const isNew = !params.number;
  const number = params.number ?? toE164(countryCode, typed);
  const saved = useContacts((s) => s.byNumber[number]);

  const [name, setName] = useState(saved?.name ?? '');
  const [company, setCompany] = useState(saved?.company ?? '');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const { start } = useStartCall();
  const canEdit = useCan('contacts.edit');
  const canBlock = useCan('contacts.block');
  const canDelete = useCan('contacts.delete');
  const canDial = useCan('dialer.call');
  const canSchedule = useCan('scheduling.create');
  // The server's copy arrived after the screen opened
  useEffect(() => {
    if (!saved) return;
    setName((v) => v || saved.name);
    setCompany((v) => v || saved.company);
    setNotes((v) => v || saved.notes);
  }, [saved]);

  const calls = useLive(useShallow((s) => Object.values(s.calls).filter((c) => c.fromNumber === number)));
  const history = useMemo(() => [...calls].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [calls]);
  const talked = history.filter((c) => c.endedAt && c.transcript.some((t) => t.speaker === 'caller'));
  const totalS = talked.reduce((sum, c) => sum + (new Date(c.endedAt!).getTime() - new Date(c.startedAt).getTime()) / 1000, 0);

  const valid = isE164(number);
  const dirty = !saved || name.trim() !== saved.name || company.trim() !== saved.company || notes.trim() !== saved.notes;

  const save = async () => {
    setBusy(true);
    const ok = await updateContact(number, { name: name.trim(), company: company.trim(), notes: notes.trim() });
    setBusy(false);
    if (ok && isNew) router.replace({ pathname: '/contact', params: { number } });
  };

  const toggle = (field: 'favorite' | 'blocked', value: boolean) => void updateContact(number, { [field]: value });

  const remove = () =>
    Alert.alert('Delete this contact?', 'Their calls stay in History.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => (await removeContact(number)) && router.back() },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isNew ? 'New contact' : saved?.name || formatPhone(number) }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Avatar label={name || '#'} photoUrl={null} size={64} />
          {isNew ? (
            <View style={styles.numberRow}>
              <CountryPicker code={countryCode} onChange={setCountryCode} />
              <TextInput value={typed} onChangeText={setTyped} placeholder="Phone number" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={[styles.input, styles.flex]} autoFocus />
            </View>
          ) : (
            <Text style={styles.number}>{formatPhone(number)}</Text>
          )}
          {saved?.blocked ? (
            <View style={styles.blocked}>
              <Ionicons name="ban" size={14} color={colors.danger} />
              <Text style={styles.blockedText}>On the do-not-call list</Text>
            </View>
          ) : null}
        </View>

        {!isNew ? (
          <View style={styles.actions}>
            {canDial ? <Button title="Call with AI" onPress={() => start(number)} disabled={!!saved?.blocked} style={styles.flex} /> : null}
            {canSchedule ? (
              <Button title="Schedule" variant="secondary" onPress={() => askCallback(number, '')} disabled={!!saved?.blocked} style={styles.flex} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Field label="Name" value={name} onChange={setName} placeholder="e.g. Asha Rao" max={80} />
          <Field label="Company" value={company} onChange={setCompany} placeholder="optional" max={80} />
          <Field label="Notes" value={notes} onChange={setNotes} placeholder="Anything the team should know" max={1000} multiline />
          {canEdit ? (
            <Button title={saved && !dirty ? 'Saved' : 'Save contact'} onPress={save} disabled={!valid || !dirty} loading={busy} />
          ) : (
            <Text style={styles.muted}>Your role lets you see contacts but not change them.</Text>
          )}
          {isNew && typed && !valid ? <Text style={styles.warn}>Keep typing: that number is too short</Text> : null}
        </View>

        {saved && (canEdit || canBlock) ? (
          <View style={styles.card}>
            {canEdit ? (
              <Toggle icon="star" color="#F59E0B" title="Favourite" sub="Shown first in Contacts and on the Call tab" value={saved.favorite} onChange={(v) => toggle('favorite', v)} />
            ) : null}
            <Toggle
              icon="ban"
              color={colors.danger}
              title="Do not call"
              sub="The AI never calls this number, by hand or on a schedule"
              value={saved.blocked}
              onChange={(v) => toggle('blocked', v)}
            />
          </View>
        ) : null}

        {!isNew ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Calls · {history.length}
              {talked.length ? ` · ${formatSeconds(totalS)} talked` : ''}
            </Text>
            {history.length ? history.slice(0, 20).map((c) => <CallCard key={c.id} call={c} />) : <Text style={styles.muted}>No calls with this number yet.</Text>}
          </View>
        ) : null}

        {saved && canDelete ? <Button title="Delete contact" variant="secondary" onPress={remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, placeholder, max, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; max: number; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.multi]}
        maxLength={max}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function Toggle({ icon, color, title, sub, value, onChange }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={[styles.toggleIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.muted}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  number: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  blocked: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.danger + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  blockedText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  actions: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  multi: { minHeight: 80 },
  warn: { fontSize: 13, color: colors.warning },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
});

export default function ContactScreenRoute() {
  return (
    <Gate perm="contacts.view">
      <ContactScreen />
    </Gate>
  );
}
