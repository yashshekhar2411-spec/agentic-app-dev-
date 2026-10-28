import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Splash } from '@/components/brand/Splash';
import { SheetHost } from '@/components/ui/ActionSheet';
import { startAuthListener, useAuth } from '@/features/auth/store';
import { syncProfile } from '@/features/profile/session';
import { useProfile } from '@/features/profile/store';
import { getIdToken } from '@/services/auth/firebase';
import { startRealtime, stopRealtime } from '@/services/realtime/socket';
import { useLive } from '@/state/liveStore';
import { colors } from '@/theme';

export default function RootLayout() {
  const serverUrl = useProfile((s) => s.serverUrl);
  const uid = useAuth((s) => s.user?.uid ?? null);
  const initializing = useAuth((s) => s.initializing);

  useEffect(() => startAuthListener((user) => void syncProfile(user?.uid ?? null)), []);

  // Live updates only while signed in; the server checks the Firebase ID token on connect
  useEffect(() => {
    if (!uid) {
      useLive.getState().reset();
      return;
    }
    startRealtime(serverUrl, getIdToken);
    return stopRealtime;
  }, [serverUrl, uid]);

  // The animated launch screen stays on top while Firebase works out who is signed in, then fades into the app
  const [splashShown, setSplashShown] = useState(true);
  const hideSplash = useCallback(() => setSplashShown(false), []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {initializing ? null : <AppStack uid={uid} />}
      {splashShown ? <Splash ready={!initializing} onDone={hideSplash} /> : null}
    </View>
  );
}

function AppStack({ uid }: { uid: string | null }) {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={!uid}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!uid}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="call/[id]" options={{ title: 'Call' }} />
          <Stack.Screen name="handoff/[id]" options={{ title: 'Handoff' }} />
          <Stack.Screen name="simulate" options={{ title: 'Test call' }} />
          <Stack.Screen name="preferences/profile" options={{ title: 'Agent profile', presentation: 'modal' }} />
          <Stack.Screen name="preferences/server" options={{ title: 'Server' }} />
          <Stack.Screen name="preferences/country" options={{ title: 'Default country' }} />
          <Stack.Screen name="preferences/notifications" options={{ title: 'Handoff alerts' }} />
          <Stack.Screen name="preferences/calling" options={{ title: 'Calling preferences' }} />
          <Stack.Screen name="preferences/agent" options={{ title: 'AI agent' }} />
          <Stack.Screen name="preferences/status" options={{ title: 'System status' }} />
          <Stack.Screen name="contacts" options={{ title: 'Contacts' }} />
          <Stack.Screen name="contact" options={{ title: 'Contact' }} />
          <Stack.Screen name="scheduled" options={{ title: 'Scheduled calls' }} />
          <Stack.Screen name="schedule" options={{ title: 'Schedule AI calls', presentation: 'modal' }} />
          <Stack.Screen name="insights" options={{ title: 'Insights' }} />
          <Stack.Screen name="team" options={{ title: 'Team & roles' }} />
          <Stack.Screen name="member" options={{ title: 'Team member' }} />
          <Stack.Screen name="roles" options={{ title: 'Roles & permissions' }} />
          <Stack.Screen name="role" options={{ title: 'Role' }} />
          <Stack.Screen name="audit" options={{ title: 'Audit log' }} />
          <Stack.Screen name="my-access" options={{ title: 'My access' }} />
        </Stack.Protected>
      </Stack>
      <SheetHost />
    </SafeAreaProvider>
  );
}
