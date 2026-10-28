import { formatPhone, groupLocal, isE164, toE164 } from '@/utils/phone';

describe('toE164', () => {
  it('adds the country code to a local number', () => {
    expect(toE164('+91', '98765 43210')).toBe('+919876543210');
  });
  it('drops a leading 0 trunk prefix', () => {
    expect(toE164('+44', '07700 900123')).toBe('+447700900123');
  });
  it('keeps a number typed with its own +', () => {
    expect(toE164('+91', '+1 415 555 0100')).toBe('+14155550100');
  });
});

describe('isE164', () => {
  it('accepts full numbers and rejects short ones', () => {
    expect(isE164('+919876543210')).toBe(true);
    expect(isE164('+91987')).toBe(false);
    expect(isE164('9876543210')).toBe(false);
  });
});

describe('formatting', () => {
  it('groups digits the way people read them', () => {
    expect(groupLocal('9876543210', '+91')).toBe('98765 43210');
    expect(groupLocal('4155550100', '+1')).toBe('415 555 0100');
  });
  it('formats known countries and leaves others alone', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+14155550100')).toBe('+1 415 555 0100');
    expect(formatPhone('+3312345678')).toBe('+3312345678');
  });
});
