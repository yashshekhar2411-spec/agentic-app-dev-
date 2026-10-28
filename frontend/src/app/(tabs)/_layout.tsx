import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';

import { MenuButton, NewCallButton } from '@/components/navigation/HeaderButtons';
import { ServerBanner } from '@/components/navigation/ServerBanner';
import { Sidebar } from '@/components/navigation/Sidebar';
import { useLive } from '@/state/liveStore';
import { selectPendingCount } from '@/features/handoff/selectors';
import { useCan } from '@/features/rbac/store';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

// Settings is no longer a tab: it opens from the profile at the bottom of the sidebar, with a back arrow
function BackToLive() {
  return (
    <Pressable onPress={() => router.navigate('/')} hitSlop={10} style={{ marginLeft: 8, padding: 6 }} accessibilityLabel="Back">
      <Ionicons name="arrow-back" size={26} color={colors.text} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const pending = useLive(selectPendingCount);
  // Tabs for modules the person's role doesn't include are hidden (href: null)
  const calls = useCan('calls.view');
  const dialer = useCan('dialer.call');
  const handoffs = useCan('handoffs.view');
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          headerTitleStyle: { color: colors.text, fontWeight: '600' },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerLeft: () => <MenuButton />,
          headerRight: () => (dialer ? <NewCallButton /> : null),
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Live calls', tabBarLabel: 'Live', tabBarIcon: icon('pulse'), href: calls ? undefined : null }} />
        <Tabs.Screen
          name="dial"
          options={{ title: 'New call', tabBarLabel: 'Call', tabBarIcon: icon('keypad'), headerRight: () => null, href: dialer ? undefined : null }}
        />
        <Tabs.Screen
          name="queue"
          options={{
            title: 'Needs a human',
            tabBarLabel: 'Queue',
            tabBarIcon: icon('hand-left'),
            tabBarBadge: pending > 0 ? pending : undefined,
            href: handoffs ? undefined : null,
          }}
        />
        <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time'), href: calls ? undefined : null }} />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            href: null, // not in the bottom bar
            tabBarStyle: { display: 'none' },
            headerLeft: () => <BackToLive />,
            headerRight: () => null,
          }}
        />
      </Tabs>
      <ServerBanner />
      <Sidebar />
    </View>
  );
}
