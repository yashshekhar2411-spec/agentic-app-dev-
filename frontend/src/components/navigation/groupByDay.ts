// Groups calls by day the way the ChatGPT sidebar groups chats: Today, Yesterday, Previous 7 days...
import type { Call } from '@/types';

export type Section = { title: string; data: Call[] };

const DAY = 86_400_000;

export function dayLabel(iso: string, now = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const age = startOfToday - new Date(iso).getTime();
  if (age <= 0) return 'Today';
  if (age <= DAY) return 'Yesterday';
  if (age <= 7 * DAY) return 'Previous 7 days';
  if (age <= 30 * DAY) return 'Previous 30 days';
  return 'Older';
}

/** `calls` newest first → one section per day group, in order, empty groups left out. */
export function groupByDay(calls: Call[], now = new Date()): Section[] {
  const sections: Section[] = [];
  for (const call of calls) {
    const title = dayLabel(call.startedAt, now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(call);
    else sections.push({ title, data: [call] });
  }
  return sections;
}

/** Does this call match what was typed in the search box? Looks at the number, what it was about and what was said. */
export function matchesSearch(call: Call, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (digits && call.fromNumber.replace(/\D/g, '').includes(digits)) return true;
  return call.purpose.toLowerCase().includes(q) || call.transcript.some((t) => t.text.toLowerCase().includes(q));
}
