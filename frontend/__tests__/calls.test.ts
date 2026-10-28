import { groupByDay, matchesSearch } from '@/components/navigation/groupByDay';
import { outcome, turnsSpoken } from '@/features/calls/callInfo';
import { dispositionOf, transcriptText } from '@/features/calls/disposition';
import type { Call, Turn } from '@/types';
import { duration, formatSeconds } from '@/utils/time';

const at = '2026-10-21T10:00:00.000Z';
const turn = (speaker: Turn['speaker'], text: string): Turn => ({ speaker, text, at });

function makeCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call_1',
    fromNumber: '+919876543210',
    direction: 'outbound',
    purpose: 'their order delivery',
    twilioCallSid: 'CA1',
    status: 'ended',
    startedAt: at,
    endedAt: '2026-10-21T10:02:05.000Z',
    transcript: [],
    handoffId: null,
    voicemailUrl: null,
    notes: '',
    tags: [],
    disposition: null,
    ...overrides,
  };
}

describe('outcome', () => {
  it('says the AI talked with them when the customer spoke', () => {
    expect(outcome(makeCall({ transcript: [turn('ai', 'Hello'), turn('caller', 'Hi')] }))).toBe('Talked with the AI');
  });
  it('reports why a call never connected', () => {
    expect(outcome(makeCall({ transcript: [turn('system', 'Nobody answered.')] }))).toBe('Nobody answered');
  });
  it('knows live calls and voicemails', () => {
    expect(outcome(makeCall({ endedAt: null, status: 'ai_active' }))).toBe('Live now');
    expect(outcome(makeCall({ status: 'voicemail' }))).toBe('Left a voicemail');
  });
  it('counts only spoken turns', () => {
    expect(turnsSpoken(makeCall({ transcript: [turn('ai', 'a'), turn('system', 'b'), turn('caller', 'c')] }))).toBe(2);
  });
});

describe('notes and sharing', () => {
  it('finds a disposition by id', () => {
    expect(dispositionOf('follow_up')?.label).toBe('Follow up');
    expect(dispositionOf(null)).toBeUndefined();
  });
  it('puts the outcome, tags, notes and every line in the shared transcript', () => {
    const text = transcriptText(
      makeCall({ disposition: 'interested', tags: ['vip'], notes: 'wants a demo', transcript: [turn('ai', 'Hello'), turn('caller', 'Yes please')] }),
      'Asha',
    );
    expect(text).toContain('AI call with Asha (+91 98765 43210)');
    expect(text).toContain('Outcome: Interested');
    expect(text).toContain('Tags: vip');
    expect(text).toContain('Notes: wants a demo');
    expect(text).toMatch(/AI: Hello/);
    expect(text).toMatch(/Customer: Yes please/);
  });
});

describe('search and grouping', () => {
  const call = makeCall({ transcript: [turn('caller', 'Where is my parcel?')] });
  it('matches the number, the topic and what was said', () => {
    expect(matchesSearch(call, '98765')).toBe(true);
    expect(matchesSearch(call, 'delivery')).toBe(true);
    expect(matchesSearch(call, 'parcel')).toBe(true);
    expect(matchesSearch(call, 'refund')).toBe(false);
  });
  it('groups calls into Today / Yesterday / older', () => {
    const now = new Date(2026, 9, 21, 15, 0);
    const today = makeCall({ id: 'a', startedAt: new Date(2026, 9, 21, 9, 0).toISOString() });
    const yesterday = makeCall({ id: 'b', startedAt: new Date(2026, 9, 20, 9, 0).toISOString() });
    const old = makeCall({ id: 'c', startedAt: new Date(2026, 8, 1, 9, 0).toISOString() });
    expect(groupByDay([today, yesterday, old], now).map((s) => s.title)).toEqual(['Today', 'Yesterday', 'Older']);
  });
});

describe('time', () => {
  it('formats durations and second counts', () => {
    expect(duration(at, '2026-10-21T10:02:05.000Z')).toBe('2:05');
    expect(formatSeconds(45)).toBe('45s');
    expect(formatSeconds(75)).toBe('1m 15s');
    expect(formatSeconds(3900)).toBe('1h 5m');
  });
});
