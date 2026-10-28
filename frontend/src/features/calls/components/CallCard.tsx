// One call as a card. Who is handling it decides how it looks:
//   AI live        deep indigo, with a live waveform
//   needs a person amber, with a pulsing alert
//   with a person  mint green, with a live dot
//   finished       a calm white card with a colour strip for who handled it
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Elapsed } from '@/components/ui/Elapsed';
import { callKind } from '@/features/calls/callInfo';
import { dispositionOf } from '@/features/calls/disposition';
import { useDisplayName } from '@/features/contacts/store';
import { useProfile } from '@/features/profile/store';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import type { Call } from '@/types';

export type Handler = 'ai' | 'waiting' | 'human' | 'voicemail';

const wasPerson = (call: Call) =>
  !!call.handoffId || call.transcript.some((t) => t.speaker === 'system' && /transferred|took over/i.test(t.text));

/** Who is (or was) dealing with this call. */
export function handlerOf(call: Call): Handler {
  if (call.status === 'awaiting_human') return 'waiting';
  if (call.status === 'human_active') return 'human';
  if (call.status === 'voicemail') return 'voicemail';
  if (call.endedAt) return wasPerson(call) ? 'human' : 'ai';
  return 'ai';
}

export const AI_DEEP = '#312E81';
export const AI_SOFT = '#A5B4FC';
export const HUMAN_GREEN = '#059669';
export const HUMAN_MINT = '#ECFDF5';
export const WAIT_AMBER = '#D97706';
export const WAIT_CREAM = '#FFF7ED';

const BARS = [10, 18, 28, 16, 24, 12, 20];
const PERIODS = [520, 640, 450, 700, 560, 610, 480];

/** A voice waveform that moves while the AI is on the call. */
function Wave({ color = AI_SOFT, height = 30 }: { color?: string; height?: number }) {
  const bars = useRef(BARS.map(() => new Animated.Value(0.4))).current;
  useEffect(() => {
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: PERIODS[i], easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0.25, duration: PERIODS[i], easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bars]);
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {BARS.map((h, i) => (
        <Animated.View key={i} style={{ width: 4, borderRadius: 2, backgroundColor: color, height: bars[i].interpolate({ inputRange: [0, 1], outputRange: [4, (h / 28) * height] }) }} />
      ))}
    </View>
  );
}

/** A soft ring that expands and fades around its child, to draw the eye. */
function Pulse({ color, children }: { color: string; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={styles.pulseWrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]}
      />
      {children}
    </View>
  );
}

function lastLine(call: Call) {
  const last = [...call.transcript].reverse().find((t) => t.speaker !== 'system');
  if (!last) return null;
  const who = last.speaker === 'ai' ? 'AI' : call.direction === 'outbound' ? 'Customer' : 'Caller';
  return { who, text: last.text, ai: last.speaker === 'ai' };
}

export const CallCard = memo(function CallCard({ call }: { call: Call }) {
  const handler = handlerOf(call);
  const open = () => router.push(`/call/${call.id}`);
  const live = !call.endedAt;
  if (live && handler === 'ai') return <AiCard call={call} onPress={open} />;
  if (live && handler === 'waiting') return <WaitingCard call={call} onPress={open} />;
  if (live && handler === 'human') return <HumanCard call={call} onPress={open} />;
  return <PastCard call={call} handler={handler} onPress={open} />;
});

function AiCard({ call, onPress }: { call: Call; onPress: () => void }) {
  const name = useDisplayName(call.fromNumber);
  const line = lastLine(call);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.ai, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={13} color={AI_DEEP} />
          <Text style={styles.aiBadgeText}>AI IS HANDLING</Text>
        </View>
        <View style={styles.flex} />
        <Elapsed since={call.startedAt} style={styles.aiTimer} />
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.aiNumber}>{name}</Text>
          <Text style={styles.aiSub}>{callKind(call) === 'inbound' ? 'Incoming call' : call.purpose ? `Calling about ${call.purpose}` : 'AI is calling'}</Text>
        </View>
        <Wave />
      </View>
      {line ? (
        <View style={styles.aiBubble}>
          <Text style={styles.aiBubbleText} numberOfLines={2}>
            <Text style={styles.aiBubbleWho}>{line.who}  </Text>
            {line.text}
          </Text>
        </View>
      ) : (
        <Text style={styles.aiWaiting}>{callKind(call) === 'inbound' ? 'Listening…' : 'Waiting for them to pick up…'}</Text>
      )}
    </Pressable>
  );
}

function WaitingCard({ call, onPress }: { call: Call; onPress: () => void }) {
  const name = useDisplayName(call.fromNumber);
  const handoff = useLive((s) => (call.handoffId ? s.handoffs[call.handoffId] : undefined));
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.waiting, pressed && styles.pressed]}>
      <View style={styles.row}>
        <Pulse color={WAIT_AMBER}>
          <View style={styles.waitIcon}>
            <Ionicons name="hand-left" size={20} color="#fff" />
          </View>
        </Pulse>
        <View style={styles.flex}>
          <Text style={styles.waitLabel}>NEEDS A PERSON</Text>
          <Text style={styles.waitNumber}>{name}</Text>
        </View>
        <Elapsed since={handoff?.createdAt ?? call.startedAt} mode="waiting" every={5000} style={styles.waitTime} />
      </View>
      {handoff?.summary ? (
        <Text style={styles.waitSummary} numberOfLines={2}>
          {handoff.summary}
        </Text>
      ) : null}
      <View style={styles.waitAction}>
        <Text style={styles.waitActionText}>Open to take this call</Text>
        <Ionicons name="arrow-forward" size={16} color={WAIT_AMBER} />
      </View>
    </Pressable>
  );
}

function HumanCard({ call, onPress }: { call: Call; onPress: () => void }) {
  const name = useDisplayName(call.fromNumber);
  const me = useProfile((s) => s.human);
  const handoff = useLive((s) => (call.handoffId ? s.handoffs[call.handoffId] : undefined));
  const line = lastLine(call);
  const who = handoff?.assignedTo ? (handoff.assignedTo === me?.id ? 'You are on this call' : 'A teammate is on this call') : 'A person is on this call';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.human, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={20} color="#fff" />
          <View style={styles.liveDot} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.humanLabel}>WITH A PERSON</Text>
          <Text style={styles.humanNumber}>{name}</Text>
        </View>
        <Elapsed since={call.startedAt} style={styles.humanTimer} />
      </View>
      <Text style={styles.humanSub}>{who}</Text>
      {line ? (
        <Text style={styles.humanLast} numberOfLines={2}>
          <Text style={styles.humanLastWho}>{line.who}  </Text>
          {line.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

const PAST = {
  ai: { color: colors.primary, label: 'AI handled', icon: 'sparkles' },
  human: { color: HUMAN_GREEN, label: 'Handled by a person', icon: 'person' },
  waiting: { color: WAIT_AMBER, label: 'Needed a person', icon: 'hand-left' },
  voicemail: { color: colors.purple, label: 'Voicemail', icon: 'recording' },
} as const;

function PastCard({ call, handler, onPress }: { call: Call; handler: Handler; onPress: () => void }) {
  const name = useDisplayName(call.fromNumber);
  const kind = PAST[handler];
  const line = lastLine(call);
  const outcome = dispositionOf(call.disposition);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.past, pressed && styles.pressed]}>
      <View style={[styles.strip, { backgroundColor: kind.color }]} />
      <View style={styles.pastBody}>
        <View style={styles.row}>
          <Text style={styles.pastNumber}>{name}</Text>
          <Elapsed since={call.startedAt} until={call.endedAt} mode={call.endedAt ? 'ago' : 'duration'} style={styles.pastMeta} />
        </View>
        <View style={styles.row}>
          <Ionicons name={kind.icon} size={13} color={kind.color} />
          <Text style={[styles.pastLabel, { color: kind.color }]}>{kind.label}</Text>
          <Text style={styles.pastMeta}>· {callKind(call) === 'inbound' ? 'Incoming' : 'Outgoing'}</Text>
          {outcome ? (
            <View style={[styles.outcome, { backgroundColor: outcome.color + '18' }]}>
              <Text style={[styles.outcomeText, { color: outcome.color }]}>{outcome.label}</Text>
            </View>
          ) : null}
        </View>
        {line ? (
          <Text style={styles.pastLast} numberOfLines={2}>
            <Text style={styles.pastLastWho}>{line.who}: </Text>
            {line.text}
          </Text>
        ) : null}
        {call.tags?.length || call.notes ? (
          <Text style={styles.pastTags} numberOfLines={1}>
            {call.tags?.map((t) => `#${t}`).join('  ')}
            {call.notes ? `${call.tags?.length ? '  · ' : ''}📝 ${call.notes}` : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.85 },
  card: { borderRadius: radius.lg, padding: 16, gap: 12 },

  // AI
  ai: { backgroundColor: AI_DEEP, elevation: 4, shadowColor: AI_DEEP, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: AI_SOFT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  aiBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: AI_DEEP },
  aiTimer: { color: '#C7D2FE', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  aiNumber: { color: '#fff', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  aiSub: { color: '#C7D2FE', fontSize: 13, marginTop: 2 },
  aiBubble: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, padding: 10 },
  aiBubbleText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  aiBubbleWho: { color: AI_SOFT, fontWeight: '700' },
  aiWaiting: { color: '#C7D2FE', fontSize: 13, fontStyle: 'italic' },

  // Needs a person
  waiting: { backgroundColor: WAIT_CREAM, borderWidth: 1.5, borderColor: '#FCD34D' },
  pulseWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  waitIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: WAIT_AMBER, alignItems: 'center', justifyContent: 'center' },
  waitLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: WAIT_AMBER },
  waitNumber: { fontSize: 19, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  waitTime: { fontSize: 13, fontWeight: '700', color: WAIT_AMBER },
  waitSummary: { fontSize: 14, color: '#78350F', lineHeight: 20 },
  waitAction: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  waitActionText: { fontSize: 14, fontWeight: '700', color: WAIT_AMBER },

  // With a person
  human: { backgroundColor: HUMAN_MINT, borderWidth: 1.5, borderColor: '#6EE7B7' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: HUMAN_GREEN, alignItems: 'center', justifyContent: 'center' },
  liveDot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#34D399', borderWidth: 2, borderColor: HUMAN_MINT },
  humanLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: HUMAN_GREEN },
  humanNumber: { fontSize: 19, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  humanTimer: { fontSize: 15, fontWeight: '700', color: HUMAN_GREEN, fontVariant: ['tabular-nums'] },
  humanSub: { fontSize: 14, fontWeight: '600', color: '#065F46' },
  humanLast: { fontSize: 14, color: '#047857', lineHeight: 20 },
  humanLastWho: { fontWeight: '700' },

  // Finished
  past: { flexDirection: 'row', backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 0, gap: 0, overflow: 'hidden' },
  strip: { width: 5 },
  pastBody: { flex: 1, padding: 14, gap: 6 },
  pastNumber: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  pastLabel: { fontSize: 12, fontWeight: '700' },
  pastMeta: { fontSize: 12, color: colors.muted },
  pastLast: { fontSize: 14, color: colors.muted },
  pastLastWho: { fontWeight: '600', color: colors.text },
  pastTags: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  outcome: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  outcomeText: { fontSize: 11, fontWeight: '700' },
});
