import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { fetchCall } from '@/features/calls/api';
import { useLive } from '@/state/liveStore';

/** A call plus its handoff, kept live by the socket. Fetches once if the store doesn't have it yet. */
export function useActiveCall(callId: string | undefined) {
  const { call, handoff } = useLive(
    useShallow((s) => {
      const call = callId ? s.calls[callId] : undefined;
      return { call, handoff: call?.handoffId ? s.handoffs[call.handoffId] : undefined };
    }),
  );

  useEffect(() => {
    if (callId && !call) {
      fetchCall(callId)
        .then((c) => useLive.getState().upsertCall(c))
        .catch(() => {});
    }
  }, [callId, call]);

  return { call, handoff };
}
