import { COUNTRIES } from '@/features/settings/store';

// "98765 43210" + "+91" -> "+919876543210"; a number typed with its own + keeps it
export function toE164(countryCode: string, number: string): string {
  const digits = number.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  return `+${countryCode.replace(/\D/g, '')}${digits.replace(/^0+/, '')}`;
}

export const isE164 = (n: string) => /^\+\d{8,15}$/.test(n);

/** Groups the digits people read in chunks: 98765 43210 for India, 415 555 0100 for the US, 3s otherwise. */
export function groupLocal(digits: string, countryCode = ''): string {
  const d = digits.replace(/\D/g, '');
  if (countryCode === '+91') return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
  if (countryCode === '+1') return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
  return d.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** "+919876543210" -> "+91 98765 43210". Unknown country codes keep the plain number. */
export function formatPhone(e164: string): string {
  if (!e164.startsWith('+')) return e164;
  const country = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => e164.startsWith(c.code));
  if (!country) return e164;
  return `${country.code} ${groupLocal(e164.slice(country.code.length), country.code)}`;
}
