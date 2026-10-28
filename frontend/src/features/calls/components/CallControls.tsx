import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { hangUpCall, hangUpTestCall } from '@/features/calls/api';
import { isElevenLabsCall } from '@/features/calls/callInfo';
import { useLive } from '@/state/liveStore';
import { useAcceptHandoff } from '@/features/handoff/hooks/useAcceptHandoff';
import type { Call, Handoff } from '@/types';
import { useCan } from '@/features/rbac/store';

export function CallControls({ call, handoff }: { call: Call; handoff?: Handoff }) {
  const { accept, busyId } = useAcceptHandoff();
  const isTestCall = !call.twilioCallSid;
  const live = !call.endedAt;
  const canTake = useCan('handoffs.take');
  const canHangUp = useCan('calls.hangup');

  const hangUp = async () => {
    try {
      const ended = isTestCall ? (await hangUpTestCall(call.id)).call : await hangUpCall(call.id);
      useLive.getState().upsertCall(ended);
    } catch (e) {
      Alert.alert('Could not end call', (e as Error).message);
    }
  };

  if (!live) return null;
  return (
    <View style={styles.row}>
      {handoff?.status === 'pending' && canTake ? (
        <Button title="Take this call" onPress={() => accept(handoff, false)} loading={busyId === handoff.id} style={styles.grow} />
      ) : null}
      {isTestCall && canHangUp ? <Button title="End test call" variant="danger" onPress={hangUp} style={styles.grow} /> : null}
      {!isTestCall && canHangUp && call.direction === 'outbound' && !isElevenLabsCall(call) ? (
        <Button title="Hang up" variant="danger" onPress={hangUp} style={styles.grow} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
});
