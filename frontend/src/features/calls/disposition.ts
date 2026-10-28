// The outcome an agent records for a call, in words and colours, plus a plain-text transcript for sharing.
import type { Call, Disposition } from '@/types';
import { formatPhone } from '@/utils/phone';
import { duration } from '@/utils/time';
import { KIND_LABEL, callKind, outcome } from './callInfo';

export const DISPOSITIONS: { id: Disposition; label: string; color: string }[] = [
  { id: 'resolved', label: 'Resolved', color: '#059669' },
  { id: 'interested', label: 'Interested', color: '#7C3AED' },
  { id: 'follow_up', label: 'Follow up', color: '#D97706' },
  { id: 'callback', label: 'Call back', color: '#2563EB' },
  { id: 'not_interested', label: 'Not interested', color: '#6B7280' },
  { id: 'no_answer', label: 'No answer', color: '#6B7280' },
  { id: 'wrong_number', label: 'Wrong number', color: '#DC2626' },
];

export const dispositionOf = (id: Disposition | null | undefined) => DISPOSITIONS.find((d) => d.id === id);

export const SUGGESTED_TAGS = ['vip', 'new lead', 'complaint', 'billing', 'urgent', 'renewal'];

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** The whole call as text, for the share sheet (WhatsApp, email, notes…). */
export function transcriptText(call: Call, name?: string | null): string {
  const who = name ? `${name} (${formatPhone(call.fromNumber)})` : formatPhone(call.fromNumber);
  const customer = call.direction === 'outbound' ? 'Customer' : 'Caller';
  const lines = [
    `${KIND_LABEL[callKind(call)]} with ${who}`,
    `${new Date(call.startedAt).toLocaleString()} · ${duration(call.startedAt, call.endedAt)} · ${outcome(call)}`,
  ];
  if (call.purpose) lines.push(`About: ${call.purpose}`);
  const d = dispositionOf(call.disposition);
  if (d) lines.push(`Outcome: ${d.label}`);
  if (call.tags?.length) lines.push(`Tags: ${call.tags.join(', ')}`);
  if (call.notes) lines.push(`Notes: ${call.notes}`);
  lines.push('', '— Transcript —');
  for (const t of call.transcript) {
    const speaker = t.speaker === 'ai' ? 'AI' : t.speaker === 'caller' ? customer : 'System';
    lines.push(`[${clock(t.at)}] ${speaker}: ${t.text}`);
  }
  return lines.join('\n');
}
