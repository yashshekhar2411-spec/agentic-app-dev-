// Test call: you play the caller by typing. Same AI + handoff logic as a real phone call.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { hangUpTestCall, sayInTestCall, startTestCall } from '@/features/calls/api';
import { LiveTranscript } from '@/features/calls/components/LiveTranscript';
import { StatusPill } from '@/features/calls/components/StatusPill';
import { useActiveCall } from '@/features/calls/hooks/useActiveCall';
import { useLive } from '@/state/liveStore';
import { REASON_LABEL } from '@/features/handoff/components/EscalationReason';
import { colors, radius } from '@/theme';
import { Gate } from '@/features/rbac/components/Gate';

const SUGGESTIONS = ['Where is my order ORD-1001?', 'Book a service visit tomorrow at 11', 'I want a refund for my watch', 'Let me talk to a real person'];

function SimulateScreen() {
  const [callId, setCallId] = useState<string>();
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const { call, handoff } = useActiveCall(callId);

  useEffect(() => {
    startTestCall()
      .then(({ call }) => {
        useLive.getState().upsertCall(call);
        setCallId(call.id);
      })
      .catch((e) => {
        Alert.alert("Can't start a test call", (e as Error).message);
        router.back();
      });
  }, []);

  const send = async (message: string) => {
    if (!callId || !message.trim() || thinking) return;
    setText('');
    setThinking(true);
    try {
      const res = await sayInTestCall(callId, message.trim());
      useLive.getState().upsertCall(res.call);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setThinking(false);
    }
  };

  const hangUp = async () => {
    if (callId) {
      try {
        const res = await hangUpTestCall(callId);
        useLive.getState().upsertCall(res.call);
      } catch {
        // already ended
      }
    }
    router.back();
  };

  const aiActive = call?.status === 'ai_active';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.top}>
        {call ? <StatusPill status={call.status} /> : <Text style={styles.muted}>Dialling…</Text>}
        <Pressable onPress={hangUp}>
          <Text style={styles.hangup}>Hang up</Text>
        </Pressable>
      </View>

      {call && !aiActive ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            {call.status === 'awaiting_human' ? 'The AI handed this call to a human' : call.status === 'human_active' ? 'A human took over' : 'Call ended'}
          </Text>
          {handoff ? <Text style={styles.noticeText}>{REASON_LABEL[handoff.reason]}</Text> : null}
          {call.status === 'awaiting_human' ? (
            <Button title="Open the queue to take it" onPress={() => router.navigate('/queue')} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.flex}>
        <LiveTranscript turns={call?.transcript ?? []} />
      </View>
      {thinking ? <Text style={styles.thinking}>AI is thinking…</Text> : null}

      {aiActive ? (
        <View style={styles.composer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Say something as the caller…"
              style={styles.input}
              onSubmitEditing={() => send(text)}
              returnKeyType="send"
            />
            <Button title="Send" onPress={() => send(text)} disabled={thinking || !text.trim()} />
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  muted: { color: colors.muted },
  hangup: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  notice: { margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.md, backgroundColor: '#FEF3C7', gap: 8 },
  noticeTitle: { fontWeight: '700', color: colors.text, fontSize: 15 },
  noticeText: { color: colors.text },
  thinking: { paddingHorizontal: 16, paddingBottom: 6, color: colors.muted, fontStyle: 'italic' },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, paddingBottom: 12 },
  chips: { gap: 8, padding: 12 },
  chip: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  chipText: { color: colors.primary, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
});

export default function SimulateScreenRoute() {
  return (
    <Gate perm="simulator.use">
      <SimulateScreen />
    </Gate>
  );
}
