// Call tab preferences: confirmation, default country, quick topics, recent numbers
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { SettingsSection } from '@/features/settings/components/SettingsList';
import { countryFor, DEFAULT_TOPICS, usePreferences } from '@/features/settings/store';
import { colors, radius } from '@/theme';

const MAX_TOPICS = 8;

export default function CallingScreen() {
  const p = usePreferences();
  const [topic, setTopic] = useState('');
  const country = countryFor(p.countryCode);

  const addTopic = () => {
    const t = topic.trim();
    if (!t) return;
    if (p.callTopics.some((x) => x.toLowerCase() === t.toLowerCase())) return setTopic('');
    p.set({ callTopics: [...p.callTopics, t].slice(0, MAX_TOPICS) });
    setTopic('');
  };

  const removeTopic = (t: string) => p.set({ callTopics: p.callTopics.filter((x) => x !== t) });

  const clearRecents = () =>
    Alert.alert('Clear recent numbers?', 'They are only stored on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => p.set({ recentNumbers: [] }) },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsSection
          title="Dialling"
          rows={[
            {
              key: 'country',
              icon: 'globe',
              iconColor: '#059669',
              title: 'Default country',
              value: country ? `${country.flag} ${country.code}` : p.countryCode,
              onPress: () => router.push('/preferences/country'),
            },
            {
              key: 'confirm',
              icon: 'shield-checkmark',
              iconColor: '#2563EB',
              title: 'Confirm before calling',
              subtitle: 'Ask “Call this number?” first, so no one is called by mistake',
              toggle: { value: p.confirmBeforeCalling, onChange: (v) => p.set({ confirmBeforeCalling: v }) },
            },
          ]}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick call topics</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>Shown as one-tap chips on the Call tab. The AI opens the call with the topic.</Text>
            <View style={styles.chips}>
              {p.callTopics.map((t) => (
                <View key={t} style={styles.chip}>
                  <Text style={styles.chipText}>{t}</Text>
                  <Pressable onPress={() => removeTopic(t)} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ))}
              {p.callTopics.length === 0 ? <Text style={styles.hint}>No topics yet.</Text> : null}
            </View>
            {p.callTopics.length < MAX_TOPICS ? (
              <View style={styles.addRow}>
                <TextInput
                  value={topic}
                  onChangeText={setTopic}
                  placeholder="e.g. their EMI due date"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  maxLength={80}
                  onSubmitEditing={addTopic}
                  returnKeyType="done"
                />
                <Button title="Add" onPress={addTopic} disabled={!topic.trim()} />
              </View>
            ) : (
              <Text style={styles.hint}>You can keep up to {MAX_TOPICS} topics.</Text>
            )}
            <Pressable onPress={() => p.set({ callTopics: DEFAULT_TOPICS })}>
              <Text style={styles.link}>Restore the default topics</Text>
            </Pressable>
          </View>
        </View>

        <SettingsSection
          title="Recent numbers"
          footer="Recent numbers appear under the dialler for one-tap redial. They never leave this phone."
          rows={[
            {
              key: 'save',
              icon: 'time',
              iconColor: '#6B7280',
              title: 'Remember numbers I call',
              toggle: { value: p.saveRecentNumbers, onChange: (v) => p.set({ saveRecentNumbers: v }) },
            },
            {
              key: 'clear',
              icon: 'trash',
              iconColor: colors.danger,
              title: 'Clear recent numbers',
              destructive: true,
              value: String(p.recentNumbers.length),
              onPress: p.recentNumbers.length ? clearRecents : undefined,
            },
          ]}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 18, paddingBottom: 32 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  hint: { fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, borderRadius: radius.pill },
  chipText: { color: colors.primary, fontWeight: '500', fontSize: 13 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13 },
});
