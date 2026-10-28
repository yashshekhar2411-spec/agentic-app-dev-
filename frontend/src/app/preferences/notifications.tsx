// Handoff alerts: on/off, which calls, vibration style, quiet hours, banner, and a test button
import { ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { SettingsSection } from '@/features/settings/components/SettingsList';
import { Stepper } from '@/components/ui/Stepper';
import { formatHour, inQuietHours, usePreferences, VIBRATION_PATTERNS, type VibrationStyle } from '@/features/settings/store';
import { vibrateFor } from '@/services/notifications';

export default function NotificationsScreen() {
  const p = usePreferences();
  const quiet = p.quietHours;
  const off = !p.vibrateOnHandoff;
  const setQuiet = (patch: Partial<typeof quiet>) => p.set({ quietHours: { ...quiet, ...patch } });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SettingsSection
        title="Handoff alerts"
        footer="Alerts only reach you while you're Online and the app is open."
        rows={[
          {
            key: 'on',
            icon: 'notifications',
            iconColor: '#DB2777',
            title: 'Vibrate for handoffs',
            subtitle: 'When a caller needs a person',
            toggle: { value: p.vibrateOnHandoff, onChange: (v) => p.set({ vibrateOnHandoff: v }) },
          },
          {
            key: 'urgent',
            icon: 'flash',
            iconColor: '#D97706',
            title: 'Urgent calls only',
            subtitle: 'Skip calls the AI didn’t mark urgent',
            toggle: { value: p.urgentOnly, onChange: (v) => p.set({ urgentOnly: v }), disabled: off },
          },
        ]}
      />

      <SettingsSection
        title="Vibration style"
        footer="Urgent calls always get a longer pattern."
        rows={(Object.keys(VIBRATION_PATTERNS) as VibrationStyle[]).map((style) => ({
          key: style,
          icon: 'pulse',
          iconColor: '#7C3AED',
          title: VIBRATION_PATTERNS[style].label,
          selected: p.vibrationStyle === style,
          onPress: () => {
            p.set({ vibrationStyle: style });
            setTimeout(() => vibrateFor('normal'), 50); // feel it straight away
          },
        }))}
      />

      <SettingsSection
        title="Quiet hours"
        footer={
          quiet.enabled
            ? `Normal alerts are silenced from ${formatHour(quiet.start)} to ${formatHour(quiet.end)}. Urgent calls still vibrate.${inQuietHours(quiet) ? ' Quiet hours are on right now.' : ''}`
            : 'Silence normal alerts overnight or during breaks.'
        }
        rows={[
          {
            key: 'quiet',
            icon: 'moon',
            iconColor: '#4338CA',
            title: 'Quiet hours',
            toggle: { value: quiet.enabled, onChange: (v) => setQuiet({ enabled: v }) },
          },
          {
            key: 'from',
            icon: 'time',
            iconColor: '#6B7280',
            title: 'From',
            right: <Stepper value={quiet.start} onChange={(v) => setQuiet({ start: v })} min={0} max={23} wrap format={formatHour} disabled={!quiet.enabled} />,
          },
          {
            key: 'to',
            icon: 'sunny',
            iconColor: '#D97706',
            title: 'Until',
            right: <Stepper value={quiet.end} onChange={(v) => setQuiet({ end: v })} min={0} max={23} wrap format={formatHour} disabled={!quiet.enabled} />,
          },
        ]}
      />

      <SettingsSection
        title="On screen"
        rows={[
          {
            key: 'banner',
            icon: 'albums',
            iconColor: '#D97706',
            title: 'Waiting-callers banner',
            subtitle: 'The orange bar on the Live tab',
            toggle: { value: p.showHandoffBanner, onChange: (v) => p.set({ showHandoffBanner: v }) },
          },
        ]}
      />

      <Button title="Test normal alert" variant="secondary" onPress={() => vibrateFor('normal')} />
      <Button title="Test urgent alert" variant="secondary" onPress={() => vibrateFor('high')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 32 },
});
