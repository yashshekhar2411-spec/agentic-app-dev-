// Live call + handoff state, fed by the WebSocket (and by API responses).
import { create } from 'zustand';

import type { Call, Handoff, ServerEvent } from '@/types';

interface LiveState {
  calls: Record<string, Call>;
  handoffs: Record<string, Handoff>;
  connected: boolean;
  setConnected: (connected: boolean) => void;
  upsertCall: (call: Call) => void;
  upsertHandoff: (handoff: Handoff) => void;
  applyEvent: (event: ServerEvent) => void;
  reset: () => void;
}

const byId = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((i) => [i.id, i]));

export const useLive = create<LiveState>()((set) => ({
  calls: {},
  handoffs: {},
  connected: false,
  setConnected: (connected) => set({ connected }),
  reset: () => set({ calls: {}, handoffs: {}, connected: false }),
  upsertCall: (call) => set((s) => ({ calls: { ...s.calls, [call.id]: call } })),
  upsertHandoff: (handoff) => set((s) => ({ handoffs: { ...s.handoffs, [handoff.id]: handoff } })),
  applyEvent: (event) =>
    set((s) => {
      switch (event.type) {
        case 'snapshot':
          return { calls: byId(event.calls), handoffs: byId(event.handoffs) };
        case 'call.started':
        case 'call.updated':
          return { calls: { ...s.calls, [event.call.id]: event.call } };
        case 'call.transcript': {
          const call = s.calls[event.callId];
          if (!call) return {};
          const last = call.transcript[call.transcript.length - 1];
          if (last && last.at === event.turn.at && last.text === event.turn.text) return {};
          return { calls: { ...s.calls, [call.id]: { ...call, transcript: [...call.transcript, event.turn] } } };
        }
        case 'handoff.requested':
        case 'handoff.updated':
        case 'handoff.accepted':
          return { handoffs: { ...s.handoffs, [event.handoff.id]: event.handoff } };
        default:
          return {};
      }
    }),
}));

const ACTIVE = new Set(['ai_active', 'awaiting_human', 'human_active']);

export const selectActiveCalls = (s: LiveState) =>
  Object.values(s.calls)
    .filter((c) => ACTIVE.has(c.status))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

export const selectPastCalls = (s: LiveState) =>
  Object.values(s.calls)
    .filter((c) => !ACTIVE.has(c.status))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
