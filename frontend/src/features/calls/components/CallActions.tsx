// A row of quick actions for a call: share the transcript, save the contact, have the AI call back later, block.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { showSheet } from '@/components/ui/ActionSheet';
import { transcriptText } from '@/features/calls/disposition';
import { updateContact, useContacts } from '@/features/contacts/store';
import { scheduleCalls } from '@/features/schedule/api';
import { useSchedule, whenLabel } from '@/features/schedule/store';
import { colors, radius } from '@/theme';
import type { Call } from '@/types';
import { formatPhone } from '@/utils/phone';
import { useCan } from '@/features/rbac/store';

type IconName = keyof typeof Ionicons.glyphMap;

/** Quick "call back in…" times, as offsets from now (or tomorrow morning). */
export const CALLBACK_PRESETS: { label: string; at: () => Date }[] = [
  { label: 'In 15 minutes', at: () => new Date(Date.now() + 15 * 60_000) },
  { label: 'In 1 hour', at: () => new Date(Date.now() + 60 * 60_000) },
  {
    label: 'Tomorrow 10 AM',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    },
  },
];

/** Asks when, then schedules an AI call to `to`. */
export function askCallback(to: string, purpose: string) {
  const book = async (at: Date) => {
    try {
      const items = await scheduleCalls({ numbers: [to], purpose, runAt: at.toISOString() });
      useSchedule.getState().upsert(...items);
      Alert.alert('Callback scheduled', `The AI will call ${formatPhone(to)} ${whenLabel(items[0].runAt)}.`, [
        { text: 'OK' },
        { text: 'See scheduled', onPress: () => router.push('/scheduled') },
      ]);
    } catch (e) {
      Alert.alert("Couldn't schedule the call", (e as Error).message);
    }
  };
  showSheet({
    title: 'Have the AI call back',
    message: `When should the AI call ${formatPhone(to)}?`,
    options: [
      ...CALLBACK_PRESETS.map((p) => ({ label: p.label, icon: 'alarm-outline' as const, onPress: () => void book(p.at()) })),
      { label: 'Pick a time…', icon: 'calendar-outline', onPress: () => router.push({ pathname: '/schedule', params: { to, purpose } }) },
    ],
  });
}

export function CallActions({ call }: { call: Call }) {
  const contact = useContacts((s) => s.byNumber[call.fromNumber]);
  const blocked = !!contact?.blocked;
  const seeContacts = useCan('contacts.view');
  const editContacts = useCan('contacts.block');
  const schedule = useCan('scheduling.create');
  const canShare = useCan('calls.export');

  const share = () => void Share.share({ message: transcriptText(call, contact?.name) }).catch(() => {});

  const toggleBlock = () => {
    if (blocked) return void updateContact(call.fromNumber, { blocked: false });
    Alert.alert(
      'Add to do-not-call?',
      `The AI won't call ${formatPhone(call.fromNumber)} again, by hand or on a schedule, until you unblock it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void updateContact(call.fromNumber, { blocked: true }) },
      ],
    );
  };

  return (
    <View style={styles.row}>
      {canShare ? <Action icon="share-outline" label="Share" onPress={share} /> : null}
      {seeContacts ? (
        <Action
          icon={contact?.name ? 'person-circle-outline' : 'person-add-outline'}
        label={contact?.name ? 'Contact' : 'Save'}
          onPress={() => router.push({ pathname: '/contact', params: { number: call.fromNumber } })}
        />
      ) : null}
      {schedule ? <Action icon="alarm-outline" label="Call back" onPress={() => askCallback(call.fromNumber, call.purpose)} disabled={blocked} /> : null}
      {editContacts ? (
        <Action icon={blocked ? 'checkmark-circle-outline' : 'ban-outline'} label={blocked ? 'Unblock' : 'Block'} onPress={toggleBlock} danger={!blocked} />
      ) : null}
    </View>
  );
}

function Action({ icon, label, onPress, danger, disabled }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const color = danger ? colors.danger : colors.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dim]} accessibilityLabel={label}>
      <View style={[styles.icon, { backgroundColor: color + '14' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 4, minWidth: 64, borderRadius: radius.md, paddingVertical: 2 },
  dim: { opacity: 0.5 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
});
