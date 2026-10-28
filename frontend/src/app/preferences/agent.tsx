// How the AI agent sounds and behaves on calls. Stored on the server, so it applies to every agent's calls.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { fetchAgentConfig, updateAgentConfig, type AgentConfig, type AgentConfigView } from '@/features/settings/api';
import { SettingsSection } from '@/features/settings/components/SettingsList';
import { Stepper } from '@/components/ui/Stepper';
import { colors, radius } from '@/theme';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

const minutes = (s: number) => (s < 60 ? `${s} sec` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`);

function AgentScreen() {
  const canEdit = useCan('ai_agent.edit');
  const [view, setView] = useState<AgentConfigView>();
  const [draft, setDraft] = useState<AgentConfig>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError(undefined);
    fetchAgentConfig()
      .then((v) => {
        setView(v);
        setDraft(v.config);
      })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(load, []);

  const changes = useMemo(() => {
    if (!view || !draft) return {};
    return Object.fromEntries(
      (Object.keys(draft) as (keyof AgentConfig)[]).filter((k) => draft[k] !== view.config[k]).map((k) => [k, draft[k]]),
    ) as Partial<AgentConfig>;
  }, [view, draft]);
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    if (!draft?.companyName.trim()) return Alert.alert('Company name is required');
    setSaving(true);
    try {
      const next = await updateAgentConfig(changes);
      setView(next);
      setDraft(next.config);
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Try again" onPress={load} />
      </View>
    );
  }
  if (!view || !draft) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const set = (patch: Partial<AgentConfig>) => setDraft({ ...draft, ...patch });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          These are saved on the server and used for every call, including calls other agents handle.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Company name</Text>
            <TextInput value={draft.companyName} onChangeText={(t) => set({ companyName: t })} style={styles.input} maxLength={60} />
            <Text style={styles.label}>Greeting for incoming calls</Text>
            <TextInput
              value={draft.customGreeting}
              onChangeText={(t) => set({ customGreeting: t })}
              placeholder="Leave empty for the standard greeting"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.multiline]}
              multiline
              maxLength={300}
            />
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Callers hear first</Text>
              <Text style={styles.previewText}>“{view.greetingPreview}”</Text>
              <Text style={[styles.previewLabel, styles.spaced]}>When the AI calls someone</Text>
              <Text style={styles.previewText}>“{view.outboundPreview}”</Text>
              {dirty ? <Text style={styles.previewHint}>Save to update the preview.</Text> : null}
            </View>
          </View>
        </View>

        <SettingsSection
          title="Voice"
          rows={view.voices.map((v) => ({
            key: v.id,
            icon: 'mic',
            iconColor: '#7C3AED',
            title: v.label.split(' · ')[0],
            subtitle: v.label.split(' · ')[1],
            selected: draft.ttsVoice === v.id,
            onPress: () => set({ ttsVoice: v.id }),
          }))}
        />

        <SettingsSection
          title="Language the AI listens for"
          footer="Speech recognition works best when this matches how callers speak."
          rows={view.languages.map((l) => ({
            key: l.id,
            icon: 'language',
            iconColor: '#0891B2',
            title: l.label,
            selected: draft.callLanguage === l.id,
            onPress: () => set({ callLanguage: l.id }),
          }))}
        />

        <SettingsSection
          title="Handoff rules"
          footer="If nobody takes a waiting call in time, the caller leaves a voicemail."
          rows={[
            {
              key: 'hold',
              icon: 'hourglass',
              iconColor: '#D97706',
              title: 'Max wait for a human',
              right: <Stepper value={draft.holdTimeoutS} onChange={(v) => set({ holdTimeoutS: v })} min={30} max={600} step={30} format={minutes} />,
            },
            {
              key: 'turns',
              icon: 'repeat',
              iconColor: '#2563EB',
              title: 'AI tries before handing off',
              subtitle: 'Replies without solving the problem',
              right: <Stepper value={draft.maxAiTurns} onChange={(v) => set({ maxAiTurns: v })} min={3} max={40} />,
            },
          ]}
        />

        <View style={styles.actions}>
          <Button title={canEdit ? 'Save changes' : 'View only: your role can not change these'} onPress={save} loading={saving} disabled={!dirty || !canEdit} />
          {dirty ? <Button title="Discard" variant="secondary" onPress={() => setDraft(view.config)} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: colors.danger, textAlign: 'center' },
  content: { padding: 16, gap: 18, paddingBottom: 32 },
  intro: { fontSize: 13, color: colors.muted, paddingHorizontal: 4 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  preview: { marginTop: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  previewLabel: { fontSize: 12, fontWeight: '600', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  previewText: { fontSize: 14, color: colors.text, marginTop: 4, fontStyle: 'italic' },
  previewHint: { fontSize: 12, color: colors.muted, marginTop: 8 },
  spaced: { marginTop: 10 },
  actions: { gap: 10 },
});

export default function AgentScreenRoute() {
  return (
    <Gate perm="ai_agent.view">
      <AgentScreen />
    </Gate>
  );
}
