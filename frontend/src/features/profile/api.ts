import { api } from '@/services/api/client';
import type { Human } from '@/types';

export const registerHuman = (name: string, phone: string) =>
  api<Human>('/humans/register', { method: 'POST', body: { name, phone } });

export const fetchMyProfile = () => api<Human>('/humans/me');

export const checkHealth = () => api<{ ok: boolean }>('/health');
