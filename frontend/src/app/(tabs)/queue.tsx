// Callers the AI handed off, waiting for a human
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HandoffCard } from '@/features/handoff/components/HandoffCard';
import { useHandoffQueue } from '@/features/handoff/hooks/useHandoffQueue';
import { Gate } from '@/features/rbac/components/Gate';

function QueueScreen() {
  const handoffs = useHandoffQueue();
  return (
    <FlatList
      data={handoffs}
      keyExtractor={(h) => h.id}
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        <EmptyState icon="checkmark-done-circle-outline" title="Nobody waiting" hint="When the AI can't handle a call, it lands here with a summary." />
      }
      renderItem={({ item }) => <HandoffCard handoff={item} />}
    />
  );
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 12 } });

export default function QueueScreenRoute() {
  return (
    <Gate perm="handoffs.view">
      <QueueScreen />
    </Gate>
  );
}
