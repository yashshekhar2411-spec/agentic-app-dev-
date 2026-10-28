// One call: who and what kind, where it is, the live transcript, and what to do next
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Elapsed } from '@/components/ui/Elapsed';
import { AI_DEEP, HUMAN_GREEN, WAIT_AMBER, handlerOf } from '@/features/calls/components/CallCard';
import { CallActions } from '@/features/calls/components/CallActions';
import { CallControls } from '@/features/calls/components/CallControls';
import { CallProgress } from '@/features/calls/components/CallProgress';
import { CallNotes } from '@/features/calls/components/CallNotes';
import { LiveTranscript } from '@/features/calls/components/LiveTranscript';
import { StatusPill } from '@/features/calls/components/StatusPill';
import { useActiveCall } from '@/features/calls/hooks/useActiveCall';
import { useStartCall } from '@/features/calls/hooks/useStartCall';
import { callKind, KIND_LABEL, outcome, turnsSpoken } from '@/features/calls/callInfo';
import { dispositionOf } from '@/features/calls/disposition';
import { useContacts } from '@/features/contacts/store';
import { ContextSummary } from '@/features/handoff/components/ContextSummary';
import { EscalationReason } from '@/features/handoff/components/EscalationReason';
import { colors, radius } from '@/theme';
import { formatPhone } from '@/utils/phone';
import { duration } from '@/utils/time';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { call, handoff } = useActiveCall(id);
  const { start, busy } = useStartCall();
  const canDial = useCan('dialer.call');
  const [tab, setTab] = useState<'transcript' | 'notes'>('transcript');
  const contact = useContacts((s) => (call ? s.byNumber[call.fromNumber] : undefined));

  if (!call) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const kind = callKind(call);
  const ended = !!call.endedAt;
  const handler = handlerOf(call);
  const tint = { ai: AI_DEEP, human: HUMAN_GREEN, waiting: WAIT_AMBER, voicemail: colors.purple }[handler];
  const handlerIcon = { ai: kind === 'inbound' ? 'call' : 'sparkles', human: 'person', waiting: 'hand-left', voicemail: 'recording' }[handler] as keyof typeof Ionicons.glyphMap;
  const about = kind === 'ai_out' && call.purpose ? ` · about ${call.purpose}` : '';
  const name = contact?.name || null;
  const disposition = dispositionOf(call.disposition);
  const hasNotes = !!(call.notes || call.tags?.length || call.disposition);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: name ?? formatPhone(call.fromNumber) }} />
      <View style={styles.header}>
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: tint + '1A' }]}>
            <Ionicons name={handlerIcon} size={22} color={tint} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.number} numberOfLines={1}>
              {name ?? formatPhone(call.fromNumber)}
            </Text>
            <Text style={styles.kind} numberOfLines={1}>
              {name ? `${formatPhone(call.fromNumber)} · ` : ''}
              {KIND_LABEL[kind]}
              {about}
            </Text>
            {contact?.blocked || disposition ? (
              <View style={styles.badges}>
                {contact?.blocked ? <Badge label="Do not call" color={colors.danger} /> : null}
                {disposition ? <Badge label={disposition.label} color={disposition.color} /> : null}
              </View>
            ) : null}
          </View>
          <View style={styles.right}>
            <Elapsed since={call.startedAt} until={call.endedAt} style={styles.timer} />
            <StatusPill status={call.status} />
          </View>
        </View>

        <CallProgress call={call} />

        {handoff ? (
          <>
            <EscalationReason reason={handoff.reason} urgency={handoff.urgency} />
            <ContextSummary handoff={handoff} />
          </>
        ) : null}

        {ended ? (
          <View style={styles.summary}>
            <Stat label="Duration" value={duration(call.startedAt, call.endedAt)} />
            <Stat label="Turns" value={String(turnsSpoken(call))} />
            <Stat label="Outcome" value={outcome(call)} wide />
          </View>
        ) : null}

        <CallControls call={call} handoff={handoff} />
        <CallActions call={call} />

        {ended && canDial ? (
          <View style={styles.again}>
            <Button
              title="Call again with AI"
              onPress={() => start(call.fromNumber, kind === 'ai_out' ? call.purpose : '')}
              loading={busy}
              disabled={busy}
              style={styles.grow}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.tabs}>
        <TabButton label="Transcript" on={tab === 'transcript'} onPress={() => setTab('transcript')} />
        <TabButton label="Notes & outcome" on={tab === 'notes'} onPress={() => setTab('notes')} dot={hasNotes} />
      </View>
      {tab === 'transcript' ? (
        <LiveTranscript turns={call.transcript} direction={call.direction} waiting={!ended} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <CallNotes call={call} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function TabButton({ label, on, onPress, dot }: { label: string; on: boolean; onPress: () => void; dot?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, on && styles.tabOn]}>
      <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
      {dot ? <View style={styles.tabDot} /> : null}
    </Pressable>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.stat, wide && styles.statWide]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 16, gap: 14, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 19, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  kind: { fontSize: 13, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  timer: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  summary: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: 10, gap: 2 },
  statWide: { flex: 2 },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  again: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  tabTextOn: { color: colors.primary },
  tabDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
});

export default function CallScreenRoute() {
  return (
    <Gate perm="calls.view">
      <CallScreen />
    </Gate>
  );
}
