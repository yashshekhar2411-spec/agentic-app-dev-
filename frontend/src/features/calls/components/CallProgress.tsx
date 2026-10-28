// Where the call is: Ringing → AI talking → With you → Ended (steps depend on the kind of call).
import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { callKind } from '@/features/calls/callInfo';
import { colors } from '@/theme';
import type { Call } from '@/types';

function steps(call: Call): { labels: string[]; at: number } {
  const kind = callKind(call);
  const ended = !!call.endedAt;
  const last = call.status === 'voicemail' ? 'Voicemail' : 'Ended';

  // Handed to a person: through the app's queue, or by the agent's transfer_to_number tool (ElevenLabs)
  const handedOver = !!call.handoffId || call.status === 'human_active' || call.transcript.some((t) => t.speaker === 'system' && /transferred/i.test(t.text));
  const talked = call.transcript.some((t) => t.speaker !== 'system');
  // Never connected (not answered, or the provider refused it): no talking step to tick
  if (kind === 'ai_out' && ended && !talked && !handedOver) return { labels: ['Ringing', last], at: 1 };
  const labels = kind === 'inbound' ? ['AI answered'] : ['Ringing', 'AI talking'];
  if (handedOver) labels.push(call.status === 'awaiting_human' ? 'Finding a person' : 'With a person');
  labels.push(last);
  if (ended) return { labels, at: labels.length - 1 };
  if (handedOver) return { labels, at: labels.length - 2 };
  // An AI call is ringing until the AI has said something (its opener is added when they pick up)
  return { labels, at: kind === 'inbound' || talked ? labels.length - 2 : 0 };
}

export function CallProgress({ call }: { call: Call }) {
  const { labels, at } = steps(call);
  const ended = !!call.endedAt;
  return (
    <View style={styles.row}>
      {labels.map((label, i) => {
        const done = i < at || (ended && i === at);
        const current = i === at && !ended;
        return (
          <Fragment key={label}>
            {i > 0 ? <View style={[styles.line, i <= at && styles.lineOn]} /> : null}
            <View style={styles.step}>
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotNow]}>
                {done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
              </View>
              <Text style={[styles.label, (done || current) && styles.labelOn]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { alignItems: 'center', gap: 4, width: 74 },
  line: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 8 },
  lineOn: { backgroundColor: colors.primary },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotNow: { borderColor: colors.primary, borderWidth: 5 },
  label: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  labelOn: { color: colors.text, fontWeight: '600' },
});
