// Live calls dashboard, split by who is handling each call: callers waiting for a person, calls with a person,
// and calls the AI is handling right now.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProfile } from '@/features/profile/store';
import { usePreferences } from '@/features/settings/store';
import { AI_DEEP, AI_SOFT, CallCard, HUMAN_GREEN, HUMAN_MINT, WAIT_AMBER, WAIT_CREAM } from '@/features/calls/components/CallCard';
import { selectActiveCalls, useLive } from '@/state/liveStore';
import { HandoffBanner } from '@/features/handoff/components/HandoffBanner';
import { colors, radius } from '@/theme';
import type { Call } from '@/types';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

type IconName = keyof typeof Ionicons.glyphMap;

const LANES: { status: Call['status']; title: string; hint: string; icon: IconName; color: string; soft: string }[] = [
  { status: 'awaiting_human', title: 'Waiting for a person', hint: 'The AI handed these over', icon: 'hand-left', color: WAIT_AMBER, soft: WAIT_CREAM },
  { status: 'human_active', title: 'With a person', hint: 'A teammate is talking to them', icon: 'person', color: HUMAN_GREEN, soft: HUMAN_MINT },
  { status: 'ai_active', title: 'AI is handling', hint: 'No person needed so far', icon: 'sparkles', color: AI_DEEP, soft: '#E0E7FF' },
];

function LiveScreen() {
  const canTest = useCan('simulator.use');
  const calls = useLive(useShallow(selectActiveCalls));
  const connected = useLive((s) => s.connected);
  const human = useProfile((s) => s.human);
  const showBanner = usePreferences((s) => s.showHandoffBanner);

  const sections = useMemo(
    () => LANES.map((lane) => ({ lane, data: calls.filter((c) => c.status === lane.status) })).filter((s) => s.data.length > 0),
    [calls],
  );
  const count = (status: Call['status']) => calls.filter((c) => c.status === status).length;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.content}
      stickySectionHeadersEnabled={false}
      SectionSeparatorComponent={null}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.danger }]} />
            <Text style={styles.status}>{connected ? 'Connected to server' : 'Not connected — check Settings'}</Text>
            {human ? (
              <Text style={styles.me}>
                {human.name} · {human.status}
              </Text>
            ) : null}
          </View>

          <View style={styles.tiles}>
            <Tile icon="sparkles" label="AI" value={count('ai_active')} bg={AI_DEEP} fg="#fff" sub={AI_SOFT} />
            <Tile icon="person" label="People" value={count('human_active')} bg={HUMAN_MINT} fg={HUMAN_GREEN} sub="#047857" border="#6EE7B7" />
            <Tile icon="hand-left" label="Waiting" value={count('awaiting_human')} bg={WAIT_CREAM} fg={WAIT_AMBER} sub="#B45309" border="#FCD34D" />
          </View>

          {!human ? <Button title="Set up your agent profile" variant="secondary" onPress={() => router.push('/preferences/profile')} /> : null}
          {showBanner ? <HandoffBanner /> : null}
          {canTest ? <Button title="Start a test call" onPress={() => router.push('/simulate')} /> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="call-outline" title="No live calls" hint="Calls the AI answers, and calls handed to a person, show up here in real time." />
      }
      renderSectionHeader={({ section }) => <LaneHeader lane={section.lane} count={section.data.length} />}
      renderItem={({ item }) => <CallCard call={item} />}
      renderSectionFooter={() => <View style={styles.sectionGap} />}
    />
  );
}

function Tile({ icon, label, value, bg, fg, sub, border }: { icon: IconName; label: string; value: number; bg: string; fg: string; sub: string; border?: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }, border ? { borderWidth: 1.5, borderColor: border } : null]}>
      <Ionicons name={icon} size={16} color={fg} />
      <Text style={[styles.tileValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: sub }]}>{label}</Text>
    </View>
  );
}

function LaneHeader({ lane, count }: { lane: (typeof LANES)[number]; count: number }) {
  return (
    <View style={styles.lane}>
      <View style={[styles.laneIcon, { backgroundColor: lane.soft }]}>
        <Ionicons name={lane.icon} size={15} color={lane.color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.laneTitle}>{lane.title}</Text>
        <Text style={styles.laneHint}>{lane.hint}</Text>
      </View>
      <View style={[styles.laneCount, { backgroundColor: lane.color }]}>
        <Text style={styles.laneCountText}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 12, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { flex: 1, fontSize: 13, color: colors.muted },
  me: { fontSize: 13, color: colors.text, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  tileValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 34 },
  tileLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  gap: { height: 12 },
  sectionGap: { height: 8 },
  lane: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 },
  laneIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  laneTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  laneHint: { fontSize: 12, color: colors.muted },
  laneCount: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  laneCountText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});

export default function LiveScreenRoute() {
  return (
    <Gate perm="calls.view">
      <LiveScreen />
    </Gate>
  );
}
