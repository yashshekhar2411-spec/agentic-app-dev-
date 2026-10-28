// What the agent writes down about a call: the outcome, tags and free notes. Saved to the server for the whole team.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { updateCallNotes } from '@/features/calls/api';
import { DISPOSITIONS, SUGGESTED_TAGS } from '@/features/calls/disposition';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import type { Call, Disposition } from '@/types';
import { useCan } from '@/features/rbac/store';

const MAX_TAGS = 12;

export function CallNotes({ call }: { call: Call }) {
  const [notes, setNotes] = useState(call.notes ?? '');
  const [tag, setTag] = useState('');
  const [saving, setSaving] = useState(false);
  const tags = call.tags ?? [];
  const editable = useCan('calls.notes'); // otherwise read-only
  // Someone else (or this phone, a moment ago) changed the notes: show theirs unless we're mid-edit
  useEffect(() => setNotes((mine) => (mine === '' || mine === call.notes ? call.notes ?? '' : mine)), [call.notes]);

  const save = async (patch: Parameters<typeof updateCallNotes>[1]) => {
    setSaving(true);
    try {
      useLive.getState().upsertCall(await updateCallNotes(call.id, patch));
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pick = (d: Disposition) => save({ disposition: call.disposition === d ? null : d });
  const addTag = (t: string) => {
    const clean = t.trim().toLowerCase();
    setTag('');
    if (!clean || tags.includes(clean) || tags.length >= MAX_TAGS) return;
    void save({ tags: [...tags, clean] });
  };
  const removeTag = (t: string) => save({ tags: tags.filter((x) => x !== t) });
  const dirty = notes.trim() !== (call.notes ?? '');

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Outcome</Text>
      <View style={styles.chips}>
        {DISPOSITIONS.map((d) => {
          const on = call.disposition === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => pick(d.id)}
              disabled={saving || !editable}
              style={[styles.chip, { borderColor: d.color + '55' }, on && { backgroundColor: d.color, borderColor: d.color }]}
            >
              {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              <Text style={[styles.chipText, { color: on ? '#fff' : d.color }]}>{d.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.title}>Tags</Text>
      <View style={styles.chips}>
        {tags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>#{t}</Text>
            {editable ? (
              <Pressable onPress={() => removeTag(t)} hitSlop={8} accessibilityLabel={`Remove tag ${t}`}>
                <Ionicons name="close-circle" size={16} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {(editable ? SUGGESTED_TAGS.filter((t) => !tags.includes(t)) : []).map((t) => (
          <Pressable key={t} onPress={() => addTag(t)} style={styles.suggest}>
            <Ionicons name="add" size={13} color={colors.muted} />
            <Text style={styles.suggestText}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {editable ? (
        <TextInput
          value={tag}
        onChangeText={setTag}
        onSubmitEditing={() => addTag(tag)}
        placeholder="Add your own tag and press enter"
        placeholderTextColor={colors.muted}
        style={styles.input}
        maxLength={30}
          returnKeyType="done"
          autoCapitalize="none"
        />
      ) : null}

      <Text style={styles.title}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="What was agreed, what to do next…"
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.notes]}
        multiline
        editable={editable}
        maxLength={4000}
        textAlignVertical="top"
      />
      {editable ? (
        <Button title={dirty ? 'Save notes' : 'Notes saved'} onPress={() => save({ notes: notes.trim() })} disabled={!dirty} loading={saving && dirty} />
      ) : (
        <Text style={styles.readOnly}>Your role lets you read these notes but not change them.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  title: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  chipText: { fontSize: 13, fontWeight: '600' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, borderRadius: radius.pill },
  tagText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  suggestText: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  notes: { minHeight: 110 },
  readOnly: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
});
