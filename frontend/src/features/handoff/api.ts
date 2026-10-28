import { api } from '@/services/api/client';
import type { Handoff } from '@/types';

export const acceptHandoff = (handoffId: string, humanId: string) =>
  api<Handoff>(`/handoffs/${handoffId}/accept`, { method: 'POST', body: { humanId } });
