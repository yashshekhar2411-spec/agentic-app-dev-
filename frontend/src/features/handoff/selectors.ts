// Handoff-specific selectors over the shared live store (src/state/liveStore.ts).
import { useLive } from '@/state/liveStore';
import type { Handoff } from '@/types';

const URGENCY = { high: 0, normal: 1, low: 2 } as const;

export const selectPendingHandoffs = (s: ReturnType<typeof useLive.getState>): Handoff[] =>
  Object.values(s.handoffs)
    .filter((h) => h.status === 'pending')
    .sort((a, b) => URGENCY[a.urgency] - URGENCY[b.urgency] || a.createdAt.localeCompare(b.createdAt));

export const selectPendingCount = (s: ReturnType<typeof useLive.getState>): number =>
  Object.values(s.handoffs).filter((h) => h.status === 'pending').length;
