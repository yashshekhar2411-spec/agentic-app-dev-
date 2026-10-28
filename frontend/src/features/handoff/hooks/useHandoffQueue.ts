import { useShallow } from 'zustand/react/shallow';

import { useLive } from '@/state/liveStore';
import { selectPendingHandoffs } from '@/features/handoff/selectors';

export function useHandoffQueue() {
  return useLive(useShallow(selectPendingHandoffs));
}
