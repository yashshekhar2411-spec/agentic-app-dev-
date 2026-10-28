import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { CallDirection, Turn } from '@/types';

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

interface Props {
  turns: Turn[];
  direction?: CallDirection; // names the other side "Customer" when we called them
  waiting?: boolean; // live AI call with nothing said yet
}

export const LiveTranscript = memo(function LiveTranscript({ turns, direction = 'inbound', waiting }: Props) {
  const list = useRef<FlatList<Turn>>(null);
  const them = direction === 'outbound' ? 'Customer' : 'Caller';

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [turns.length]);

  return (
    <FlatList
      ref={list}
      data={turns}
      keyExtractor={(t, i) => `${i}-${t.at}`}
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        waiting ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.emptyText}>Waiting for them to pick up…</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) =>
        item.speaker === 'system' ? (
          <View style={styles.systemRow}>
            <Ionicons name="information-circle-outline" size={13} color={colors.muted} />
            <Text style={styles.system}>{item.text}</Text>
          </View>
        ) : (
          <View style={[styles.bubble, item.speaker === 'caller' ? styles.caller : styles.ai]}>
            <View style={styles.meta}>
              <Text style={[styles.who, item.speaker === 'caller' && styles.callerMeta]}>{item.speaker === 'caller' ? them : 'AI agent'}</Text>
              <Text style={[styles.time, item.speaker === 'caller' && styles.callerMeta]}>{clock(item.at)}</Text>
            </View>
            <Text style={[styles.text, item.speaker === 'caller' && styles.callerText]}>{item.text}</Text>
          </View>
        )
      }
    />
  );
});

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: radius.lg },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderBottomLeftRadius: 4 },
  caller: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 2 },
  who: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  time: { fontSize: 11, color: colors.muted },
  callerMeta: { color: '#ffffffB3' },
  text: { fontSize: 15, color: colors.text, lineHeight: 21 },
  callerText: { color: '#fff' },
  systemRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, maxWidth: '90%' },
  system: { fontSize: 12, color: colors.muted, fontStyle: 'italic', textAlign: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
  emptyText: { fontSize: 14, color: colors.muted },
});
