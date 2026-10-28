import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Elapsed } from '@/components/ui/Elapsed';
import { useLive } from '@/state/liveStore';
import { useAcceptHandoff } from '@/features/handoff/hooks/useAcceptHandoff';
import { colors } from '@/theme';
import type { Handoff } from '@/types';
import { ContextSummary } from './ContextSummary';
import { EscalationReason } from './EscalationReason';
import { useCan } from '@/features/rbac/store';

export const HandoffCard = memo(function HandoffCard({ handoff }: { handoff: Handoff }) {
  const canTake = useCan('handoffs.take');
  const call = useLive((s) => s.calls[handoff.callId]);
  const { accept, busyId } = useAcceptHandoff();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.from}>{call?.fromNumber ?? 'Caller'}</Text>
        <Elapsed since={handoff.createdAt} mode="waiting" every={5000} style={styles.wait} />
      </View>
      <EscalationReason reason={handoff.reason} urgency={handoff.urgency} />
      <ContextSummary handoff={handoff} />
      <View style={styles.actions}>
        <Button title="View transcript" variant="secondary" onPress={() => router.push(`/call/${handoff.callId}`)} style={styles.grow} />
        {canTake ? <Button title="Take call" onPress={() => accept(handoff)} loading={busyId === handoff.id} style={styles.grow} /> : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  from: { fontSize: 17, fontWeight: '700', color: colors.text },
  wait: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
});
