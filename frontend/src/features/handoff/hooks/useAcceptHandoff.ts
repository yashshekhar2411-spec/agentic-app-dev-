import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useProfile } from '@/features/profile/store';
import { useLive } from '@/state/liveStore';
import { acceptHandoff } from '@/features/handoff/api';
import type { Handoff } from '@/types';

export function useAcceptHandoff() {
  const [busyId, setBusyId] = useState<string | null>(null);

  const accept = async (handoff: Handoff, openCall = true) => {
    const { human, setHuman } = useProfile.getState();
    if (!human) {
      router.push('/preferences/profile');
      return;
    }
    setBusyId(handoff.id);
    try {
      const updated = await acceptHandoff(handoff.id, human.id);
      useLive.getState().upsertHandoff(updated);
      setHuman({ ...human, status: 'busy' });
      const call = useLive.getState().calls[updated.callId];
      Alert.alert(
        'Call accepted',
        call?.twilioCallSid ? `Your phone (${human.phone}) will ring now. Answer it to talk to the caller.` : 'This is a test call, so no phone will ring.',
      );
      if (openCall) router.push(`/call/${updated.callId}`);
    } catch (e) {
      Alert.alert('Could not take the call', (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return { accept, busyId };
}
