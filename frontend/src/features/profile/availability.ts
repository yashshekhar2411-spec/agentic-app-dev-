// Human availability (online | busy | offline). Only online humans get handoff alerts.
import { useProfile } from '@/features/profile/store';
import { api } from '@/services/api/client';
import type { Human, HumanStatus } from '@/types';

export async function setMyStatus(status: HumanStatus): Promise<Human> {
  const { human, setHuman } = useProfile.getState();
  if (!human) throw new Error('Sign in first');
  const updated = await api<Human>(`/humans/${human.id}/status`, { method: 'PATCH', body: { status } });
  setHuman(updated);
  return updated;
}
