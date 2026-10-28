// What kind of call this is and how it went, in words for the Call tab and the call screen.
import type { Call } from '@/types';

export type CallKind = 'ai_out' | 'inbound';

export function callKind(call: Call): CallKind {
  return call.direction === 'inbound' ? 'inbound' : 'ai_out';
}

export const KIND_LABEL: Record<CallKind, string> = {
  ai_out: 'AI call',
  inbound: 'Incoming call',
};

export const isLive = (call: Call) => !call.endedAt;

/** True for calls run by ElevenLabs: the AI (or the customer) ends them, the app can't hang them up. */
export const isElevenLabsCall = (call: Call) => !!call.twilioCallSid && /^el(-pending)?:/.test(call.twilioCallSid);

/** One line on how the call went, e.g. "Nobody answered." or "Talked with the AI". */
export function outcome(call: Call): string {
  if (isLive(call)) return 'Live now';
  if (call.status === 'voicemail') return 'Left a voicemail';
  if (call.status === 'human_active') return 'Handed to a person';
  const system = [...call.transcript].reverse().find((t) => t.speaker === 'system')?.text ?? '';
  if (/not answered|nobody answered|busy|failed|cancel|couldn't|never reported|before anyone spoke/i.test(system)) return system.replace(/\.$/, '');
  if (call.transcript.some((t) => t.speaker === 'system' && /transferred/i.test(t.text))) return 'Handed to a person';
  const spoke = call.transcript.some((t) => t.speaker === 'caller');
  return spoke ? 'Talked with the AI' : 'Ended before they spoke';
}

export const turnsSpoken = (call: Call) => call.transcript.filter((t) => t.speaker !== 'system').length;
