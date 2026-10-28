// The team's contacts: favourites first, search, one-tap AI call, and the do-not-call list.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useContacts } from '@/features/contacts/store';
import { useStartCall } from '@/features/calls/hooks/useStartCall';
import { colors, radius } from '@/theme';
import type { Contact } from '@/types';
import { formatPhone } from '@/utils/phone';
import { Gate } from '@/features/rbac/components/Gate';
import { useCan } from '@/features/rbac/store';

type Filter = 'all' | 'favorites' | 'blocked';

function ContactsScreen() {
  const contacts = useContacts(useShallow((s) => Object.values(s.byNumber)));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { start } = useStartCall();
  const canEdit = useCan('contacts.edit');
  const canDial = useCan('dialer.call');
  useEffect(() => void useContacts.getState().refresh(), []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return contacts
      .filter((c) => (filter === 'favorites' ? c.favorite : filter === 'blocked' ? c.blocked : true))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (!!digits && c.number.includes(digits)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (a.name || '~').localeCompare(b.name || '~') || a.number.localeCompare(b.number));
  }, [contacts, query, filter]);

  const counts = { all: contacts.length, favorites: contacts.filter((c) => c.favorite).length, blocked: contacts.filter((c) => c.blocked).length };

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerRight: () =>
            canEdit ? (
              <Pressable onPress={() => router.push('/contact')} hitSlop={10} accessibilityLabel="Add contact">
                <Ionicons name="person-add-outline" size={24} color={colors.primary} />
              </Pressable>
            ) : null,
        }}
      />
      <View style={styles.top}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search name, company or number" placeholderTextColor={colors.muted} style={styles.searchInput} />
        </View>
        <View style={styles.filters}>
          {(['all', 'favorites', 'blocked'] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterOn]}>
              <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
                {f === 'all' ? 'All' : f === 'favorites' ? 'Favourites' : 'Do not call'} · {counts[f]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.number}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={contacts.length ? 'No contacts match' : 'No contacts yet'}
            hint={contacts.length ? undefined : 'Save a number from any call, or tap + to add one. Names show up on calls for the whole team.'}
          />
        }
        renderItem={({ item }) => <Row contact={item} onCall={canDial ? () => start(item.number) : undefined} />}
      />
    </View>
  );
}

function Row({ contact, onCall }: { contact: Contact; onCall?: () => void }) {
  const title = contact.name || formatPhone(contact.number);
  const sub = [contact.name ? formatPhone(contact.number) : null, contact.company || null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => router.push({ pathname: '/contact', params: { number: contact.number } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar label={contact.name || '#'} photoUrl={null} size={42} />
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          {contact.favorite ? <Ionicons name="star" size={14} color="#F59E0B" /> : null}
        </View>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {contact.blocked ? (
        <View style={styles.blocked}>
          <Ionicons name="ban" size={13} color={colors.danger} />
          <Text style={styles.blockedText}>Do not call</Text>
        </View>
      ) : onCall ? (
        <Pressable onPress={onCall} hitSlop={6} style={styles.call} accessibilityLabel={`Call ${title} with the AI`}>
          <Ionicons name="sparkles" size={17} color={colors.ai} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { padding: 16, paddingBottom: 8, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.text },
  filterTextOn: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.85 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  call: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ai + '14' },
  blocked: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  blockedText: { fontSize: 11, fontWeight: '700', color: colors.danger },
});

export default function ContactsScreenRoute() {
  return (
    <Gate perm="contacts.view">
      <ContactsScreen />
    </Gate>
  );
}
