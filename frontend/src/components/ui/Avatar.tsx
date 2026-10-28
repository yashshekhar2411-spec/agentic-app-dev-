import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import type { HumanStatus } from '@/types';

export const STATUS_COLOR: Record<HumanStatus, string> = {
  online: colors.success,
  busy: colors.warning,
  offline: '#9CA3AF',
};

const PALETTE = ['#4F46E5', '#0891B2', '#7C3AED', '#DB2777', '#059669', '#D97706'];

function initials(label: string): string {
  const words = label.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

// Same person, same colour, every time
function colorFor(label: string): string {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface Props {
  label: string; // name or email, for the initials
  photoUrl?: string | null;
  size?: number;
  status?: HumanStatus; // shows a presence dot, like Instagram / LinkedIn
}

export function Avatar({ label, photoUrl, size = 84, status }: Props) {
  const [broken, setBroken] = useState(false);
  const dot = Math.max(14, size * 0.24);
  return (
    <View style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]}>
      {photoUrl && !broken ? (
        <Image
          source={{ uri: photoUrl }}
          onError={() => setBroken(true)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(label) }]}>
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(label)}</Text>
        </View>
      )}
      {status ? (
        <View
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: STATUS_COLOR[status], right: size * 0.04, bottom: size * 0.04 },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  dot: { position: 'absolute', borderWidth: 3, borderColor: colors.card },
});
