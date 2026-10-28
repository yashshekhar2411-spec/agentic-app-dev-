// The left sidebar, laid out like the ChatGPT app's: search and "new" on top, the main places, your recent items
// grouped by day (here, calls), and your profile with Settings at the bottom.
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Keyboard,
  PanResponder,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { callKind } from '@/features/calls/callInfo';
import { selectPendingCount } from '@/features/handoff/selectors';
import { useAuth } from '@/features/auth/store';
import { useProfile } from '@/features/profile/store';
import { useContacts } from '@/features/contacts/store';
import { selectUpcomingCount, useSchedule } from '@/features/schedule/store';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import { useAccess } from '@/features/rbac/store';
import type { Call, PermissionId } from '@/types';
import { formatPhone } from '@/utils/phone';
import { closeDrawer, useDrawer } from './drawer';
import { groupByDay, matchesSearch } from './groupByDay';

const WIDTH = Math.min(330, Math.round(Dimensions.get('window').width * 0.85));
const EDGE = 18; // px at the left edge where a swipe pulls the sidebar out
const PANEL = '#F9F9F9';
const SELECTED = '#ECECEC';

// Each place shows only if the person's role gives them that module
const NAV: { path: string; label: string; icon: keyof typeof Ionicons.glyphMap; perm: PermissionId }[] = [
  { path: '/dial', label: 'New call', icon: 'create-outline', perm: 'dialer.call' },
  { path: '/', label: 'Live calls', icon: 'pulse-outline', perm: 'calls.view' },
  { path: '/queue', label: 'Needs a human', icon: 'hand-left-outline', perm: 'handoffs.view' },
  { path: '/history', label: 'History', icon: 'time-outline', perm: 'calls.view' },
  { path: '/scheduled', label: 'Scheduled calls', icon: 'alarm-outline', perm: 'scheduling.view' },
  { path: '/contacts', label: 'Contacts', icon: 'people-outline', perm: 'contacts.view' },
  { path: '/insights', label: 'Insights', icon: 'stats-chart-outline', perm: 'insights.view' },
  { path: '/team', label: 'Team & roles', icon: 'shield-checkmark-outline', perm: 'team.view' },
  { path: '/audit', label: 'Audit log', icon: 'document-lock-outline', perm: 'audit.view' },
];

const KIND = {
  ai_out: { icon: 'sparkles', color: colors.ai },
  direct: { icon: 'person', color: colors.success },
  inbound: { icon: 'call', color: colors.primary },
} as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

export function Sidebar() {
  const open = useDrawer((s) => s.open);
  const insets = useSafeAreaInsets();
  const x = useRef(new Animated.Value(-WIDTH)).current; // the panel's slide: -WIDTH (hidden) … 0 (open)
  const [query, setQuery] = useState('');

  const slideTo = (open: boolean) =>
    Animated.timing(x, { toValue: open ? 0 : -WIDTH, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

  useEffect(() => {
    slideTo(open);
    if (!open) {
      Keyboard.dismiss();
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The Android back button closes the sidebar first
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (closeDrawer(), true));
    return () => sub.remove();
  }, [open]);

  // Swipe right from the left edge to open
  const edge = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, -WIDTH + g.dx)),
      onPanResponderRelease: (_, g) => (g.dx > WIDTH * 0.3 || g.vx > 0.5 ? useDrawer.getState().setOpen(true) : slideTo(false)),
      onPanResponderTerminate: () => slideTo(false),
    }),
  ).current;

  // Swipe left on the open sidebar to close
  const panel = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(Math.max(-WIDTH, Math.min(0, g.dx))),
      onPanResponderRelease: (_, g) => (g.dx < -WIDTH * 0.25 || g.vx < -0.5 ? useDrawer.getState().setOpen(false) : slideTo(true)),
      onPanResponderTerminate: () => slideTo(true),
    }),
  ).current;

  const backdrop = x.interpolate({ inputRange: [-WIDTH, 0], outputRange: [0, 0.4], extrapolate: 'clamp' });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open ? null : <View style={styles.edge} {...edge.panHandlers} />}
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { width: WIDTH, paddingTop: insets.top + 8, paddingBottom: insets.bottom, transform: [{ translateX: x }] }]}
        pointerEvents={open ? 'auto' : 'none'}
        {...panel.panHandlers}
      >
        <SidebarBody query={query} onQuery={setQuery} />
      </Animated.View>
    </View>
  );
}

function SidebarBody({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const pathname = usePathname();
  const pending = useLive(selectPendingCount);
  const upcoming = useSchedule(selectUpcomingCount);
  const permissions = useAccess((s) => (s.suspended ? [] : s.permissions));
  const nav = NAV.filter((item) => permissions.includes(item.perm));
  const seeCalls = permissions.includes('calls.view');
  const contacts = useContacts((s) => s.byNumber);
  const calls = useLive(useShallow((s) => Object.values(s.calls).sort((a, b) => b.startedAt.localeCompare(a.startedAt))));
  const searching = query.trim().length > 0;
  const sections = useMemo(
    () => (!seeCalls ? [] : groupByDay(calls.filter((c) => matchesSearch(c, query) || (!!query.trim() && (contacts[c.fromNumber]?.name ?? '').toLowerCase().includes(query.trim().toLowerCase()))))),
    [calls, contacts, query, seeCalls],
  );

  const go = (path: string) => {
    closeDrawer();
    router.navigate(path as never);
  };

  return (
    <>
      <View style={styles.topRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Search calls"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searching ? (
            <Pressable onPress={() => onQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {permissions.includes('dialer.call') ? (
          <Pressable onPress={() => go('/dial')} hitSlop={8} style={({ pressed }) => [styles.newButton, pressed && styles.pressed]} accessibilityLabel="New call">
            <Ionicons name="create-outline" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          searching ? null : (
            <View style={styles.nav}>
              {nav.map((item) => {
                const active = pathname === item.path;
                return (
                  <Pressable key={item.path} onPress={() => go(item.path)} style={({ pressed }) => [styles.navItem, (active || pressed) && styles.selected]}>
                    <Ionicons name={item.icon} size={22} color={colors.text} />
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                    {item.path === '/queue' && pending > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{pending}</Text>
                      </View>
                    ) : null}
                    {item.path === '/scheduled' && upcoming > 0 ? (
                      <View style={[styles.badge, styles.badgeQuiet]}>
                        <Text style={styles.badgeText}>{upcoming}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => <CallRow call={item} onPress={() => (closeDrawer(), router.push(`/call/${item.id}`))} />}
        ListEmptyComponent={
          <Text style={styles.empty}>{searching ? 'No calls match your search.' : 'Calls you make and receive will show up here.'}</Text>
        }
        ListHeaderComponentStyle={undefined}
      />

      <Footer onPress={() => go('/settings')} />
    </>
  );
}

function CallRow({ call, onPress }: { call: Call; onPress: () => void }) {
  const name = useContacts((s) => s.byNumber[call.fromNumber]?.name);
  const kind = KIND[callKind(call)];
  const live = !call.endedAt;
  const today = new Date(call.startedAt).toDateString() === new Date().toDateString();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.selected]}>
      <Ionicons name={kind.icon} size={18} color={kind.color} />
      <Text style={styles.rowTitle} numberOfLines={1}>
        {name || formatPhone(call.fromNumber)}
      </Text>
      {live ? <View style={styles.liveDot} /> : <Text style={styles.rowTime}>{today ? clock(call.startedAt) : shortDate(call.startedAt)}</Text>}
    </Pressable>
  );
}

function Footer({ onPress }: { onPress: () => void }) {
  const human = useProfile((s) => s.human);
  const user = useAuth((s) => s.user);
  const name = human?.name ?? user?.name ?? user?.email ?? 'Your profile';
  const status = human?.status ?? 'offline';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.footer, pressed && styles.selected]}>
      <Avatar label={name} photoUrl={user?.photoUrl ?? null} size={38} />
      <View style={styles.footerText}>
        <Text style={styles.footerName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: status === 'online' ? colors.success : status === 'busy' ? colors.warning : colors.muted }]} />
          <Text style={styles.statusText}>{status === 'online' ? 'Online' : status === 'busy' ? 'On a call' : 'Offline'}</Text>
        </View>
      </View>
      <Ionicons name="settings-outline" size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: PANEL, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border, elevation: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SELECTED, borderRadius: radius.pill, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  newButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: SELECTED },
  list: { paddingHorizontal: 8, paddingBottom: 12 },
  nav: { paddingTop: 4, paddingBottom: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, height: 46, borderRadius: radius.md },
  selected: { backgroundColor: SELECTED },
  navLabel: { flex: 1, fontSize: 16, color: colors.text },
  navLabelActive: { fontWeight: '600' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeQuiet: { backgroundColor: colors.primary },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 10, paddingTop: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, height: 44, borderRadius: radius.md },
  rowTitle: { flex: 1, fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  rowTime: { fontSize: 12, color: colors.muted },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center', paddingHorizontal: 20, paddingTop: 28 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, marginBottom: 8, padding: 8, borderRadius: radius.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  footerText: { flex: 1 },
  footerName: { fontSize: 16, fontWeight: '600', color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: colors.muted },
});
