// Scheduled AI calls and campaigns: what's coming up, how far a campaign has got, and what failed.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useContacts } from '@/features/contacts/store';
import { cancelCampaign, cancelScheduled, clearFinishedScheduled, runScheduledNow } from '@/features/schedule/api';
import { type Campaign, groupCampaigns, isWaiting, useSchedule, whenLabel } from '@/features/schedule/store';
import { useNow } from '@/hooks/useNow';
import { colors, radius } from '@/theme';
import type { ScheduledCall, ScheduleStatus } from '@/types';
import { formatPhone } from '@/utils/phone';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

const STATUS: Record<ScheduleStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  scheduled: { label: 'Scheduled', color: colors.primary, icon: 'alarm-outline' },
  placing: { label: 'Calling…', color: colors.ai, icon: 'call-outline' },
  placed: { label: 'Called', color: colors.success, icon: 'checkmark-circle' },
  failed: { label: 'Failed', color: colors.danger, icon: 'alert-circle' },
  cancelled: { label: 'Cancelled', color: colors.muted, icon: 'close-circle-outline' },
};

async function act<T>(what: string, run: () => Promise<T>) {
  try {
    return await run();
  } catch (e) {
    Alert.alert(`Couldn't ${what}`, (e as Error).message);
    return null;
  }
}

function ScheduledScreen() {
  const items = useSchedule(useShallow((s) => Object.values(s.byId)));
  useNow(30_000); // keep "in 5 min" labels fresh
  const canManage = useCan('scheduling.cancel');
  useEffect(() => void useSchedule.getState().refresh(), []);

  const campaigns = useMemo(() => groupCampaigns(items), [items]);
  const upcoming = campaigns.filter((c) => c.items.some(isWaiting));
  const done = campaigns.filter((c) => !c.items.some(isWaiting)).reverse();

  const clear = async () => {
    if (await act('clear', clearFinishedScheduled)) await useSchedule.getState().refresh();
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerRight: () =>
            canManage ? (
              <Pressable onPress={() => router.push('/schedule')} hitSlop={10} accessibilityLabel="Schedule calls">
                <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
              </Pressable>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!campaigns.length ? (
          <>
            <EmptyState icon="alarm-outline" title="Nothing scheduled" hint="Have the AI call someone back later, or paste a list of numbers to run a calling campaign." />
            {canManage ? <Button title="Schedule AI calls" onPress={() => router.push('/schedule')} /> : null}
          </>
        ) : null}
        {upcoming.length ? <Text style={styles.sectionTitle}>Coming up</Text> : null}
        {upcoming.map((c) => (
          <CampaignCard key={c.key} campaign={c} />
        ))}
        {done.length ? (
          <View style={styles.doneHeader}>
            <Text style={[styles.sectionTitle, styles.flex]}>Finished</Text>
            {canManage ? (
              <Pressable onPress={clear} hitSlop={8}>
                <Text style={styles.link}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {done.map((c) => (
          <CampaignCard key={c.key} campaign={c} />
        ))}
      </ScrollView>
    </View>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { items } = campaign;
  const canManage = useCan('scheduling.cancel');
  if (items.length === 1) return <SingleCard item={items[0]} />;
  const placed = items.filter((i) => i.status === 'placed').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const waiting = items.filter(isWaiting);
  const finished = items.length - waiting.length;
  const next = waiting[0];
  const batchId = items[0].batchId!;

  const stop = () =>
    Alert.alert('Stop this campaign?', `${waiting.length} calls that haven't been placed yet will be cancelled.`, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          const cancelled = await act('stop the campaign', () => cancelCampaign(batchId));
          if (cancelled) useSchedule.getState().upsert(...cancelled);
        },
      },
    ]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.purple + '18' }]}>
          <Ionicons name="megaphone-outline" size={20} color={colors.purple} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {campaign.name || 'Calling campaign'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {items.length} numbers{campaign.purpose ? ` · about ${campaign.purpose}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.progress}>
        {/* one segment per finished share: placed, then failed / cancelled */}
        {placed ? <View style={[styles.segment, { flex: placed, backgroundColor: colors.success }]} /> : null}
        {finished - placed ? <View style={[styles.segment, { flex: finished - placed, backgroundColor: colors.muted }]} /> : null}
        {waiting.length ? <View style={[styles.segment, { flex: waiting.length, backgroundColor: colors.primarySoft }]} /> : null}
      </View>
      <Text style={styles.sub}>
        {placed} called{failed ? ` · ${failed} failed` : ''}
        {waiting.length ? ` · ${waiting.length} to go · next ${whenLabel(next.runAt)}` : ' · done'}
      </Text>
      {items.slice(0, 50).map((i) => (
        <ItemRow key={i.id} item={i} compact />
      ))}
      {waiting.length && canManage ? <Button title="Stop campaign" variant="secondary" onPress={stop} /> : null}
    </View>
  );
}

function SingleCard({ item }: { item: ScheduledCall }) {
  return (
    <View style={styles.card}>
      <ItemRow item={item} />
    </View>
  );
}

function ItemRow({ item, compact }: { item: ScheduledCall; compact?: boolean }) {
  const name = useContacts((s) => s.byNumber[item.to]?.name);
  const st = STATUS[item.status];
  const canManage = useCan('scheduling.cancel');
  const open = item.callId ? () => router.push(`/call/${item.callId}`) : undefined;

  const cancel = async () => {
    const res = await act('cancel', () => cancelScheduled(item.id));
    if (res) useSchedule.getState().upsert(res);
  };
  const runNow = async () => {
    const res = await act('place the call', () => runScheduledNow(item.id));
    if (res) useSchedule.getState().upsert(res);
  };

  return (
    <Pressable onPress={open} disabled={!open} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Ionicons name={st.icon} size={compact ? 16 : 22} color={st.color} />
      <View style={styles.flex}>
        <Text style={compact ? styles.itemName : styles.title} numberOfLines={1}>
          {name || formatPhone(item.to)}
        </Text>
        <Text style={[styles.sub, item.status === 'failed' && { color: colors.danger }]} numberOfLines={2}>
          {item.status === 'failed' ? item.error || 'Failed' : `${st.label} · ${whenLabel(item.runAt)}`}
          {!compact && item.purpose ? ` · about ${item.purpose}` : ''}
        </Text>
      </View>
      {!canManage ? null : item.status === 'scheduled' ? (
        <>
          <Small icon="play" label="Call now" onPress={runNow} />
          <Small icon="close" label="Cancel" onPress={cancel} danger />
        </>
      ) : item.status === 'failed' || item.status === 'cancelled' ? (
        <Small icon="refresh" label="Try again" onPress={runNow} />
      ) : open ? (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      ) : null}
    </Pressable>
  );
}

function Small({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? colors.danger : colors.primary;
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.small, { backgroundColor: color + '14' }]} accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, marginTop: 4 },
  doneHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.muted },
  progress: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  segment: { height: 8, borderRadius: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, borderRadius: radius.sm },
  pressed: { opacity: 0.7 },
  itemName: { fontSize: 14, fontWeight: '500', color: colors.text },
  small: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

export default function ScheduledScreenRoute() {
  return (
    <Gate perm="scheduling.view">
      <ScheduledScreen />
    </Gate>
  );
}
