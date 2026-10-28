// Places an AI call, with the optional "are you sure" prompt, then opens the call screen.
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { startOutboundCall } from '@/features/calls/api';
import { usePreferences } from '@/features/settings/store';
import { useLive } from '@/state/liveStore';
import { formatPhone } from '@/utils/phone';

export function useStartCall() {
  const [busy, setBusy] = useState(false);

  const place = useCallback(async (to: string, purpose: string, onPlaced?: () => void) => {
    setBusy(true);
    try {
      const started = await startOutboundCall(to, purpose);
      useLive.getState().upsertCall(started);
      usePreferences.getState().addRecent(to, purpose);
      onPlaced?.();
      router.push(`/call/${started.id}`);
    } catch (e) {
      Alert.alert("Couldn't place the call", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(
    (to: string, purpose = '', onPlaced?: () => void) => {
      if (busy) return;
      const about = purpose.trim();
      if (!usePreferences.getState().confirmBeforeCalling) return void place(to, about, onPlaced);
      Alert.alert('Call this number?', `The AI will call ${formatPhone(to)}${about ? ` about ${about}` : ''}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => void place(to, about, onPlaced) },
      ]);
    },
    [busy, place],
  );

  return { start, busy };
}
