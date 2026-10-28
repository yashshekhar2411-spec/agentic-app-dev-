// How calls are going: volume, how many connect, how many the AI finishes alone, outcomes, tags and top numbers.
// Worked out on the phone from the calls the server sent (its most recent HISTORY_LIMIT calls).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { DISPOSITIONS } from '@/features/calls/disposition';
import { useContacts } from '@/features/contacts/store';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import type { Call } from '@/types';
import { formatPhone } from '@/utils/phone';
import { formatSeconds } from '@/utils/time';
import { Gate } from '@/features/rbac/components/Gate';

type Range = 'today' | '7d' | '30d' | 'all';
const RANGES: { id: Range; label: string; days: number }[] = [
  { id: 'today', label: 'Today', days: 1 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: 'all', label: 'All', days: 0 },
];

const DAY = 86_400_000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const spoke = (c: Call) => c.transcript.some((t) => t.speaker === 'caller');
const talkSeconds = (c: Call) => (c.endedAt ? (new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000 : 0);
const wentToPerson = (c: Call) => !!c.handoffId || c.status === 'human_active' || c.transcript.some((t) => t.speaker === 'system' && /transferred|took over/i.test(t.text));
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');

interface Bar {
  key: string;
  label: string; // under the bar (may be blank to avoid crowding)
  full: string; // shown when tapped
  value: number;
}

function volume(calls: Call[], range: Range, now: number): Bar[] {
  if (range === 'today') {
    const hours = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: h % 6 === 0 ? `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}` : '', full: `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`, value: 0 }));
    for (const c of calls) hours[new Date(c.startedAt).getHours()].value++;
    return hours;
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : Math.min(60, Math.max(7, Math.ceil((now - Math.min(now, ...calls.map((c) => new Date(c.startedAt).getTime()))) / DAY) + 1));
  const today = startOfDay(now);
  const bars: Bar[] = Array.from({ length: days }, (_, i) => {
    const t = today - (days - 1 - i) * DAY;
    const d = new Date(t);
    const every = days <= 7 ? 1 : days <= 30 ? 5 : 10;
    return {
      key: String(t),
      label: (days - 1 - i) % every === 0 ? (days <= 7 ? d.toLocaleDateString([], { weekday: 'short' }) : `${d.getDate()}/${d.getMonth() + 1}`) : '',
      full: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
      value: 0,
    };
  });
  for (const c of calls) {
    const i = days - 1 - Math.round((today - startOfDay(new Date(c.startedAt).getTime())) / DAY);
    if (i >= 0 && i < days) bars[i].value++;
  }
  return bars;
}

function InsightsScreen() {
  const all = useLive(useShallow((s) => Object.values(s.calls)));
  const names = useContacts((s) => s.byNumber);
  const [range, setRange] = useState<Range>('7d');
  const [now] = useState(Date.now());

  const stats = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    const from = days ? startOfDay(now) - (days - 1) * DAY : 0;
    const calls = all.filter((c) => new Date(c.startedAt).getTime() >= from);
    const finished = calls.filter((c) => c.endedAt);
    const connected = finished.filter(spoke);
    const aiOnly = connected.filter((c) => !wentToPerson(c) && c.status !== 'voicemail');
    const toPerson = calls.filter(wentToPerson);
    const voicemails = calls.filter((c) => c.status === 'voicemail').length;
    const talk = connected.reduce((sum, c) => sum + talkSeconds(c), 0);

    const outcomes = DISPOSITIONS.map((d) => ({ ...d, value: calls.filter((c) => c.disposition === d.id).length })).filter((d) => d.value);
    const unrecorded = finished.filter((c) => !c.disposition).length;

    const tagCounts = new Map<string, number>();
    for (const c of calls) for (const t of c.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const byNumber = new Map<string, number>();
    for (const c of calls) byNumber.set(c.fromNumber, (byNumber.get(c.fromNumber) ?? 0) + 1);
    const top = [...byNumber.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      calls,
      total: calls.length,
      incoming: calls.filter((c) => c.direction === 'inbound').length,
      outgoing: calls.filter((c) => c.direction === 'outbound').length,
      finished: finished.length,
      connected: connected.length,
      aiOnly: aiOnly.length,
      toPerson: toPerson.length,
      voicemails,
      avgTalk: connected.length ? talk / connected.length : 0,
      totalTalk: talk,
      outcomes,
      unrecorded,
      tags,
      top,
      bars: volume(calls, range, now),
    };
  }, [all, range, now]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.ranges}>
        {RANGES.map((r) => (
          <Pressable key={r.id} onPress={() => setRange(r.id)} style={[styles.range, range === r.id && styles.rangeOn]}>
            <Text style={[styles.rangeText, range === r.id && styles.rangeTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroValue}>{stats.total}</Text>
        <Text style={styles.heroLabel}>
          calls · {stats.incoming} incoming · {stats.outgoing} outgoing
        </Text>
      </View>

      <View style={styles.tiles}>
        <Tile icon="call" label="Connected" value={pct(stats.connected, stats.finished)} sub={`${stats.connected} of ${stats.finished} finished`} />
        <Tile icon="sparkles" label="AI resolved alone" value={pct(stats.aiOnly, stats.connected)} sub={`${stats.aiOnly} calls`} />
        <Tile icon="person" label="Handed to a person" value={String(stats.toPerson)} sub={pct(stats.toPerson, stats.total) + ' of calls'} />
        <Tile icon="time" label="Avg talk time" value={formatSeconds(stats.avgTalk)} sub={`${formatSeconds(stats.totalTalk)} in total`} />
        <Tile icon="recording" label="Voicemails" value={String(stats.voicemails)} />
        <Tile icon="checkmark-done" label="Outcome recorded" value={pct(stats.finished - stats.unrecorded, stats.finished)} sub={`${stats.unrecorded} still to fill in`} />
      </View>

      <Section title={range === 'today' ? 'Calls by hour' : 'Calls per day'}>
        <BarChart bars={stats.bars} />
      </Section>

      <Section title="Outcomes">
        {stats.outcomes.length ? (
          <HBars rows={stats.outcomes.map((o) => ({ key: o.id, label: o.label, value: o.value }))} />
        ) : (
          <Text style={styles.muted}>No outcomes recorded yet. Open a call and pick one under “Notes & outcome”.</Text>
        )}
      </Section>

      {stats.tags.length ? (
        <Section title="Top tags">
          <View style={styles.tags}>
            {stats.tags.map(([t, n]) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>#{t}</Text>
                <Text style={styles.tagCount}>{n}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {stats.top.length ? (
        <Section title="Most frequent numbers">
          {stats.top.map(([n, count]) => (
            <Pressable key={n} onPress={() => router.push({ pathname: '/contact', params: { number: n } })} style={({ pressed }) => [styles.topRow, pressed && styles.pressed]}>
              <Text style={styles.topName} numberOfLines={1}>
                {names[n]?.name || formatPhone(n)}
              </Text>
              <Text style={styles.topCount}>{count} calls</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Text style={styles.footnote}>Based on the {all.length} most recent calls the server keeps.</Text>
    </ScrollView>
  );
}

function Tile({ icon, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHead}>
        <Ionicons name={icon} size={14} color={colors.primary} />
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      {sub ? (
        <Text style={styles.tileSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const CHART_H = 120;

/** One series of vertical bars. Tap a bar to read its exact value; the busiest bar is labelled. */
function BarChart({ bars }: { bars: Bar[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0]);
  const shown = bars.find((b) => b.key === picked) ?? null;
  return (
    <View style={styles.chart}>
      <Text style={styles.readout}>{shown ? `${shown.full}: ${shown.value} ${shown.value === 1 ? 'call' : 'calls'}` : peak?.value ? `Busiest: ${peak.full}, ${peak.value} calls` : 'No calls in this period'}</Text>
      <View style={styles.plot}>
        <View style={[styles.gridLine, { bottom: CHART_H }]} />
        <View style={[styles.gridLine, { bottom: CHART_H / 2 }]} />
        <Text style={[styles.axisValue, { bottom: CHART_H - 6 }]}>{max}</Text>
        {bars.map((b) => {
          const on = picked === b.key;
          return (
            <Pressable key={b.key} onPress={() => setPicked(on ? null : b.key)} style={styles.barSlot} hitSlop={{ top: 10, bottom: 10 }}>
              <View
                style={[
                  styles.bar,
                  { height: b.value ? Math.max(4, (b.value / max) * CHART_H) : 0, backgroundColor: picked && !on ? colors.primary + '55' : colors.primary },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.baseline} />
      <View style={styles.labels}>
        {bars.map((b) => (
          <Text key={b.key} style={styles.barLabel} numberOfLines={1}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars for a breakdown: label, bar, count. */
function HBars({ rows }: { rows: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={styles.hbars}>
      {[...rows].sort((a, b) => b.value - a.value).map((r) => (
        <View key={r.key} style={styles.hrow}>
          <Text style={styles.hlabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.htrack}>
            <View style={[styles.hbar, { width: `${(r.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.hvalue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  ranges: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  range: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  rangeOn: { backgroundColor: colors.primary },
  rangeText: { fontSize: 13, fontWeight: '600', color: colors.text },
  rangeTextOn: { color: '#fff' },
  hero: { alignItems: 'center', paddingVertical: 4 },
  heroValue: { fontSize: 44, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 14, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, flexShrink: 1 },
  tileValue: { fontSize: 24, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  tileSub: { fontSize: 12, color: colors.muted },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  muted: { fontSize: 13, color: colors.muted },
  chart: { gap: 6 },
  readout: { fontSize: 13, fontWeight: '600', color: colors.text },
  plot: { height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingLeft: 22 },
  gridLine: { position: 'absolute', left: 22, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  axisValue: { position: 'absolute', left: 0, fontSize: 10, color: colors.muted },
  barSlot: { flex: 1, height: CHART_H, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  baseline: { height: 1, backgroundColor: colors.border, marginLeft: 22 },
  labels: { flexDirection: 'row', gap: 2, paddingLeft: 22 },
  barLabel: { flex: 1, fontSize: 10, color: colors.muted, textAlign: 'left', overflow: 'visible' },
  hbars: { gap: 10 },
  hrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hlabel: { width: 110, fontSize: 13, color: colors.text },
  htrack: { flex: 1, height: 10, justifyContent: 'center' },
  hbar: { height: 10, borderRadius: 4, backgroundColor: colors.primary },
  hvalue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  tagText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  tagCount: { color: colors.text, fontWeight: '700', fontSize: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pressed: { opacity: 0.7 },
  topName: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  topCount: { fontSize: 13, color: colors.muted },
  footnote: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});

export default function InsightsScreenRoute() {
  return (
    <Gate perm="insights.view">
      <InsightsScreen />
    </Gate>
  );
}
