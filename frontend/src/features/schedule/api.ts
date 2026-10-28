import { api } from '@/services/api/client';
import type { ScheduledCall } from '@/types';

export const fetchScheduled = () => api<ScheduledCall[]>('/scheduled');

// One number is a callback; several are a campaign the AI works through, spacingS apart
export const scheduleCalls = (body: { numbers: string[]; purpose: string; runAt?: string; spacingS?: number; name?: string }) =>
  api<ScheduledCall[]>('/scheduled', { method: 'POST', body });

export const cancelScheduled = (id: string) => api<ScheduledCall>(`/scheduled/${id}/cancel`, { method: 'POST' });

export const cancelCampaign = (batchId: string) => api<ScheduledCall[]>(`/scheduled/batch/${batchId}/cancel`, { method: 'POST' });

export const runScheduledNow = (id: string) => api<ScheduledCall>(`/scheduled/${id}/run-now`, { method: 'POST' });

export const clearFinishedScheduled = () => api<{ removed: number }>('/scheduled/clear-finished', { method: 'POST' });
