import { dayLabel } from '@/components/navigation/groupByDay';
import type { AuditEntry } from '@/types';

/** Newest-first entries → Today / Yesterday / Previous 7 days… sections. */
export function groupByDayLabel(entries: AuditEntry[], now = new Date()): { title: string; data: AuditEntry[] }[] {
  const sections: { title: string; data: AuditEntry[] }[] = [];
  for (const e of entries) {
    const title = dayLabel(e.at, now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(e);
    else sections.push({ title, data: [e] });
  }
  return sections;
}
