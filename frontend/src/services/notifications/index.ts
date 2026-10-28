// In-app alert when a caller needs a human. (Background push needs FCM setup — see docs/handoff-flow.md.)
import { Vibration } from 'react-native';

import { useProfile } from '@/features/profile/store';
import { inQuietHours, usePreferences, VIBRATION_PATTERNS } from '@/features/settings/store';
import type { Handoff } from '@/types';

export function vibrateFor(urgency: Handoff['urgency']) {
  const pattern = VIBRATION_PATTERNS[usePreferences.getState().vibrationStyle];
  Vibration.vibrate(urgency === 'high' ? pattern.urgent : pattern.normal);
}

export function alertNewHandoff(handoff: Handoff) {
  const human = useProfile.getState().human;
  const { vibrateOnHandoff, urgentOnly, quietHours } = usePreferences.getState();
  if (human?.status !== 'online' || !vibrateOnHandoff) return;
  if (urgentOnly && handoff.urgency !== 'high') return;
  if (inQuietHours(quietHours) && handoff.urgency !== 'high') return; // urgent calls still get through
  vibrateFor(handoff.urgency);
}
