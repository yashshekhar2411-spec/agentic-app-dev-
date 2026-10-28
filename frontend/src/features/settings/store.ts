// This phone's app preferences (alerts, calling). Persisted on the device, not on the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Country {
  code: string; // dialling code, e.g. +91
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'United States / Canada', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
];

export const countryFor = (code: string) => COUNTRIES.find((c) => c.code === code);

export type VibrationStyle = 'gentle' | 'standard' | 'strong';

// Vibration timings (ms): wait, buzz, pause, buzz…
export const VIBRATION_PATTERNS: Record<VibrationStyle, { label: string; normal: number[]; urgent: number[] }> = {
  gentle: { label: 'Gentle', normal: [0, 200], urgent: [0, 250, 150, 250] },
  standard: { label: 'Standard', normal: [0, 400, 200, 400], urgent: [0, 500, 200, 500, 200, 500] },
  strong: { label: 'Strong', normal: [0, 700, 250, 700], urgent: [0, 900, 250, 900, 250, 900, 250, 900] },
};

export const DEFAULT_TOPICS = ['their order delivery', 'confirming their appointment', 'feedback on their recent service', 'a pending payment reminder'];

export interface RecentNumber {
  number: string; // E.164
  purpose: string;
  at: string; // ISO time
}

export interface Preferences {
  // Alerts
  vibrateOnHandoff: boolean;
  urgentOnly: boolean; // only alert for high-urgency handoffs
  vibrationStyle: VibrationStyle;
  quietHours: { enabled: boolean; start: number; end: number }; // hours 0-23, local time
  showHandoffBanner: boolean; // the orange "callers need a human" bar on the Live tab
  // Calling
  countryCode: string; // pre-filled on the Call tab
  confirmBeforeCalling: boolean;
  callTopics: string[]; // quick "what to call about" chips on the Call tab
  recentNumbers: RecentNumber[];
  saveRecentNumbers: boolean;
}

const DEFAULTS: Preferences = {
  vibrateOnHandoff: true,
  urgentOnly: false,
  vibrationStyle: 'standard',
  quietHours: { enabled: false, start: 22, end: 8 },
  showHandoffBanner: true,
  countryCode: '+91',
  confirmBeforeCalling: false,
  callTopics: DEFAULT_TOPICS,
  recentNumbers: [],
  saveRecentNumbers: true,
};

const MAX_RECENTS = 10;

interface PreferencesState extends Preferences {
  set: (patch: Partial<Preferences>) => void;
  addRecent: (number: string, purpose: string) => void;
  reset: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      addRecent: (number, purpose) =>
        set((s) =>
          s.saveRecentNumbers
            ? {
                recentNumbers: [
                  { number, purpose, at: new Date().toISOString() },
                  ...s.recentNumbers.filter((r) => r.number !== number),
                ].slice(0, MAX_RECENTS),
              }
            : {},
        ),
      reset: () => set(DEFAULTS),
    }),
    // Older saved preferences lack the newer fields: fill them from the defaults
    { name: 'agentic-preferences', storage: createJSONStorage(() => AsyncStorage), merge: (saved, current) => ({ ...current, ...(saved as object) }) },
  ),
);

/** True if `date` falls inside the quiet hours (which may wrap past midnight, e.g. 22 → 8). */
export function inQuietHours(q: Preferences['quietHours'], date = new Date()): boolean {
  if (!q.enabled || q.start === q.end) return false;
  const h = date.getHours();
  return q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

export const formatHour = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
