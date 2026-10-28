// Calls you placed, newest first: how each went, with one-tap redial.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { isLive, outcome } from '@/features/calls/callInfo';
import { useContactName } from '@/features/contacts/store';
import { usePreferences } from '@/features/settings/store';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import type { Call } from '@/types';
import { formatPhone } from '@/utils/phone';
import { duration, timeAgo } from '@/utils/time';
import { useCan } from '@/features/rbac/store';

interface Entry {
  number: string;
  purpose: string;
  at: string;
  call?: Call; // the server's record, while it still has one
}

const MAX = 8;

export const RecentCalls = memo(function RecentCalls({ onRedial }: { onRedial: (number: string, purpose: string) => void }) {
  const placed = useLive(useShallow((s) => Object.values(s.calls).filter((c) => c.direction === 'outbound')));
  const saved = usePreferences((s) => s.recentNumbers);

  // The server's calls know how they went; numbers saved on the phone fill in what the server no longer has
  const entries = useMemo(() => {
    const byNumber = new Map<string, Entry>();
    for (const call of [...placed].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
      if (byNumber.has(call.fromNumber)) continue;
      byNumber.set(call.fromNumber, { number: call.fromNumber, purpose: call.purpose, at: call.startedAt, call });
    }
    for (const r of saved) {
      if (!byNumber.has(r.number)) byNumber.set(r.number, { number: r.number, purpose: r.purpose, at: r.at });
    }
    return [...byNumber.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);
  }, [placed, saved]);

  if (!entries.length) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Recent</Text>
      {entries.map((e) => (
        <Row key={e.number} entry={e} onRedial={onRedial} />
      ))}
    </View>
  );
});

function Row({ entry, onRedial }: { entry: Entry; onRedial: (number: string, purpose: string) => void }) {
  const { call } = entry;
  const name = useContactName(entry.number);
  const canDial = useCan('dialer.call');
  const live = call ? isLive(call) : false;
  const detail = [
    call ? outcome(call) : null,
    call?.endedAt && call.transcript.some((t) => t.speaker === 'caller') ? duration(call.startedAt, call.endedAt) : null,
    entry.purpose || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => (call ? router.push(`/call/${call.id}`) : onRedial(entry.number, entry.purpose))}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.ai + '1A' }]}>
        <Ionicons name="sparkles" size={16} color={colors.ai} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.number}>{name ?? formatPhone(entry.number)}</Text>
        <Text style={[styles.detail, live && styles.live]} numberOfLines={1}>
          {detail || 'AI call'}
        </Text>
      </View>
      <Text style={styles.when}>{live ? '' : timeAgo(entry.at)}</Text>
      {canDial ? (
        <Pressable hitSlop={6} onPress={() => onRedial(entry.number, entry.purpose)} style={[styles.action, { backgroundColor: colors.ai + '14' }]} accessibilityLabel="Call again with the AI">
          <Ionicons name="call" size={16} color={colors.ai} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  title: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, padding: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  pressed: { backgroundColor: colors.bg },
  flex: { flex: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 15, color: colors.text, fontWeight: '500', fontVariant: ['tabular-nums'] },
  detail: { fontSize: 12, color: colors.muted },
  live: { color: colors.success, fontWeight: '600' },
  when: { fontSize: 12, color: colors.muted },
  action: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
