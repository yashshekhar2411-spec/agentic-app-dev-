// Scheduled AI calls and campaigns, loaded from the server and kept live by the socket.
import { create } from 'zustand';

import { fetchScheduled } from '@/features/schedule/api';
import type { ScheduledCall } from '@/types';

interface ScheduleState {
  byId: Record<string, ScheduledCall>;
  loaded: boolean;
  refresh: () => Promise<void>;
  upsert: (...items: ScheduledCall[]) => void;
}

export const useSchedule = create<ScheduleState>()((set) => ({
  byId: {},
  loaded: false,
  refresh: async () => {
    try {
      const list = await fetchScheduled();
      set({ byId: Object.fromEntries(list.map((i) => [i.id, i])), loaded: true });
    } catch {
      // offline or an older server: keep what we have
    }
  },
  upsert: (...items) => set((s) => ({ byId: { ...s.byId, ...Object.fromEntries(items.map((i) => [i.id, i])) } })),
}));

export const isWaiting = (i: ScheduledCall) => i.status === 'scheduled' || i.status === 'placing';

export const selectUpcomingCount = (s: ScheduleState) => Object.values(s.byId).filter(isWaiting).length;

export interface Campaign {
  key: string; // batch id, or the single call's id
  name: string;
  purpose: string;
  items: ScheduledCall[]; // in calling order
}

/** Scheduled calls grouped into campaigns (a single callback is a campaign of one), soonest first. */
export function groupCampaigns(items: ScheduledCall[]): Campaign[] {
  const groups = new Map<string, Campaign>();
  for (const i of [...items].sort((a, b) => a.runAt.localeCompare(b.runAt))) {
    const key = i.batchId ?? i.id;
    const g = groups.get(key) ?? { key, name: i.batchName, purpose: i.purpose, items: [] };
    g.items.push(i);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** "in 5 min", "today 4:30 PM", "tomorrow 10:00 AM", "12 Nov, 9:00 AM" */
export function whenLabel(iso: string, now = new Date()): string {
  const t = new Date(iso);
  const mins = Math.round((t.getTime() - now.getTime()) / 60000);
  if (mins <= 0 && mins > -1) return 'now';
  if (mins > 0 && mins < 60) return `in ${mins} min`;
  const clock = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(t) - day(now)) / 86_400_000);
  if (diff === 0) return `today ${clock}`;
  if (diff === 1) return `tomorrow ${clock}`;
  if (diff === -1) return `yesterday ${clock}`;
  return `${t.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${clock}`;
}
