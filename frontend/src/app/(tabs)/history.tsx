// Finished calls and voicemails: search by name, number, notes or what was said, and filter by how they went.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { EmptyState } from '@/components/ui/EmptyState';
import { groupByDay, matchesSearch } from '@/components/navigation/groupByDay';
import { CallCard, handlerOf } from '@/features/calls/components/CallCard';
import { DISPOSITIONS } from '@/features/calls/disposition';
import { useContacts } from '@/features/contacts/store';
import { selectPastCalls, useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import type { Call } from '@/types';
import { Gate } from '@/features/rbac/components/Gate';

type Filter = { id: string; label: string; test: (c: Call) => boolean };

const FILTERS: Filter[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'in', label: 'Incoming', test: (c) => c.direction === 'inbound' },
  { id: 'out', label: 'Outgoing', test: (c) => c.direction === 'outbound' },
  { id: 'ai', label: 'AI handled', test: (c) => handlerOf(c) === 'ai' && c.transcript.some((t) => t.speaker === 'caller') },
  { id: 'person', label: 'With a person', test: (c) => handlerOf(c) === 'human' },
  { id: 'missed', label: 'Not connected', test: (c) => !c.transcript.some((t) => t.speaker === 'caller') && c.status !== 'voicemail' },
  { id: 'voicemail', label: 'Voicemail', test: (c) => c.status === 'voicemail' },
  { id: 'todo', label: 'No outcome yet', test: (c) => !c.disposition },
  ...DISPOSITIONS.map((d) => ({ id: d.id, label: d.label, test: (c: Call) => c.disposition === d.id })),
];

function HistoryScreen() {
  const calls = useLive(useShallow(selectPastCalls));
  const contacts = useContacts((s) => s.byNumber);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)!.test;
    const shown = calls.filter(
      (c) =>
        test(c) &&
        (!q ||
          matchesSearch(c, q) ||
          (contacts[c.fromNumber]?.name ?? '').toLowerCase().includes(q) ||
          (c.notes ?? '').toLowerCase().includes(q) ||
          (c.tags ?? []).some((t) => t.includes(q.replace(/^#/, '')))),
    );
    return groupByDay(shown);
  }, [calls, contacts, query, filter]);

  const count = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Name, number, #tag, notes or words said"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => router.push('/insights')} style={styles.insights} accessibilityLabel="Insights">
              <Ionicons name="stats-chart" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyboardShouldPersistTaps="handled">
            {FILTERS.map((f) => (
              <Pressable key={f.id} onPress={() => setFilter(f.id)} style={[styles.filter, filter === f.id && styles.filterOn]}>
                <Text style={[styles.filterText, filter === f.id && styles.filterTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {query || filter !== 'all' ? <Text style={styles.count}>{count} of {calls.length} calls</Text> : null}
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListEmptyComponent={
        calls.length ? <EmptyState icon="search-outline" title="No calls match" hint="Try another word or filter." /> : <EmptyState icon="time-outline" title="No past calls yet" />
      }
      renderItem={({ item }) => <CallCard call={item} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 10, marginBottom: 4 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  insights: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 8, paddingRight: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.text },
  filterTextOn: { color: '#fff' },
  count: { fontSize: 12, color: colors.muted, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 8 },
});

export default function HistoryScreenRoute() {
  return (
    <Gate perm="calls.view">
      <HistoryScreen />
    </Gate>
  );
}
