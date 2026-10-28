import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { HandoffReason } from '@/types';

export const REASON_LABEL: Record<HandoffReason, string> = {
  caller_requested_human: 'Caller asked for a person',
  agent_decided: 'AI decided it needs help',
  repeated_failure: "AI couldn't understand the caller",
  too_many_turns: 'Taking too long to resolve',
  tool_failure: 'A system lookup failed',
  model_refusal: 'AI declined the request',
  agent_error: 'AI had a problem',
};

export function EscalationReason({ reason, urgency }: { reason: HandoffReason; urgency: string }) {
  const urgent = urgency === 'high';
  return (
    <View style={styles.row}>
      <Ionicons name="alert-circle" size={16} color={urgent ? colors.danger : colors.warning} />
      <Text style={styles.text}>{REASON_LABEL[reason] ?? reason}</Text>
      {urgent ? <Text style={styles.urgent}>URGENT</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  urgent: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
});
