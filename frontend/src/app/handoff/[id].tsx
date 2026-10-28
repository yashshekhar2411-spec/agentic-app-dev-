// Deep link target for a handoff (e.g. from a notification): opens its call
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useLive } from '@/state/liveStore';
import { colors } from '@/theme';
import { Gate } from '@/features/rbac/components/Gate';

function HandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const handoff = useLive((s) => (id ? s.handoffs[id] : undefined));
  if (handoff) return <Redirect href={`/call/${handoff.callId}`} />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export default function HandoffScreenRoute() {
  return (
    <Gate perm="handoffs.view">
      <HandoffScreen />
    </Gate>
  );
}
