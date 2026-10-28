import { groupCampaigns, isWaiting, whenLabel } from '@/features/schedule/store';
import type { ScheduledCall } from '@/types';

function item(id: string, runAt: string, overrides: Partial<ScheduledCall> = {}): ScheduledCall {
  return {
    id,
    to: '+919876543210',
    purpose: '',
    runAt,
    status: 'scheduled',
    callId: null,
    error: '',
    batchId: null,
    batchName: '',
    createdAt: runAt,
    ...overrides,
  };
}

describe('groupCampaigns', () => {
  it('puts the calls of one campaign together, in calling order, soonest campaign first', () => {
    const groups = groupCampaigns([
      item('b2', '2026-10-21T10:02:00Z', { batchId: 'bat_1', batchName: 'Renewals' }),
      item('solo', '2026-10-21T09:00:00Z'),
      item('b1', '2026-10-21T10:00:00Z', { batchId: 'bat_1', batchName: 'Renewals' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['solo', 'bat_1']);
    expect(groups[1].name).toBe('Renewals');
    expect(groups[1].items.map((i) => i.id)).toEqual(['b1', 'b2']);
  });
});

describe('isWaiting', () => {
  it('is true only before a call is placed', () => {
    expect(isWaiting(item('a', '2026-10-21T10:00:00Z'))).toBe(true);
    expect(isWaiting(item('a', '2026-10-21T10:00:00Z', { status: 'placing' }))).toBe(true);
    expect(isWaiting(item('a', '2026-10-21T10:00:00Z', { status: 'placed' }))).toBe(false);
    expect(isWaiting(item('a', '2026-10-21T10:00:00Z', { status: 'cancelled' }))).toBe(false);
  });
});

describe('whenLabel', () => {
  const now = new Date(2026, 9, 21, 12, 0, 0);
  it('says "in N min" within the hour', () => {
    expect(whenLabel(new Date(2026, 9, 21, 12, 5).toISOString(), now)).toBe('in 5 min');
  });
  it('names today and tomorrow', () => {
    expect(whenLabel(new Date(2026, 9, 21, 16, 30).toISOString(), now)).toMatch(/^today /);
    expect(whenLabel(new Date(2026, 9, 22, 10, 0).toISOString(), now)).toMatch(/^tomorrow /);
  });
});
