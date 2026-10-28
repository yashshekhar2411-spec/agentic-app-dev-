import { api } from '@/services/api/client';
import type { AgentReply, Call, Disposition } from '@/types';

export const fetchCall = (id: string) => api<Call>(`/calls/${id}`);

// Real phone call out: ElevenLabs rings `to` and the AI starts talking when they pick up
export const startOutboundCall = (to: string, purpose: string) =>
  api<Call>('/calls/outbound', { method: 'POST', body: { to, purpose } });

export const hangUpCall = (callId: string) => api<Call>(`/calls/${callId}/hangup`, { method: 'POST' });

// What the agent writes down about a call: only the fields given change
export const updateCallNotes = (callId: string, patch: { notes?: string; tags?: string[]; disposition?: Disposition | null }) =>
  api<Call>(`/calls/${callId}`, { method: 'PATCH', body: patch });

// Simulator: a text-driven fake phone call, handled by the same AI + handoff logic as real calls
export const startTestCall = () =>
  api<{ call: Call; reply: string }>('/simulate/calls', { method: 'POST', body: { fromNumber: '+910000000000' } });

export const sayInTestCall = (callId: string, text: string) =>
  api<{ call: Call; reply: AgentReply }>(`/simulate/calls/${callId}/say`, { method: 'POST', body: { text } });

export const hangUpTestCall = (callId: string) =>
  api<{ call: Call }>(`/simulate/calls/${callId}/hangup`, { method: 'POST' });
