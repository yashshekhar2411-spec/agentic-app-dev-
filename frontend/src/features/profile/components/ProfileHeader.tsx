// LinkedIn-style top card: cover banner, avatar overlapping it, name + headline, and actions
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { Human } from '@/types';
import { Avatar } from '@/components/ui/Avatar';

interface Props {
  name: string;
  email: string | null;
  photoUrl: string | null;
  human: Human | null;
  onEdit: () => void;
  onTestCall: () => void;
}

export function ProfileHeader({ name, email, photoUrl, human, onEdit, onTestCall }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.banner}>
        <View style={[styles.bubble, styles.bubbleA]} />
        <View style={[styles.bubble, styles.bubbleB]} />
        <View style={[styles.bubble, styles.bubbleC]} />
        <Ionicons name="headset" size={26} color="rgba(255,255,255,0.35)" style={styles.bannerIcon} />
      </View>

      <View style={styles.body}>
        <View style={styles.avatar}>
          <Avatar label={name} photoUrl={photoUrl} status={human?.status} />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.headline}>Support agent · AI call center</Text>
        <View style={styles.metaRow}>
          {human ? (
            <View style={styles.meta}>
              <Ionicons name="call-outline" size={13} color={colors.muted} />
              <Text style={styles.metaText}>{human.phone}</Text>
            </View>
          ) : null}
          {email ? (
            <View style={styles.meta}>
              <Ionicons name="mail-outline" size={13} color={colors.muted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {email}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onEdit} style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}>
            <Ionicons name={human ? 'create-outline' : 'person-add-outline'} size={16} color="#fff" />
            <Text style={styles.actionPrimaryText}>{human ? 'Edit profile' : 'Set up profile'}</Text>
          </Pressable>
          <Pressable onPress={onTestCall} style={({ pressed }) => [styles.action, styles.actionOutline, pressed && styles.pressed]}>
            <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
            <Text style={styles.actionOutlineText}>Test call</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const BANNER = 96;

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  banner: { height: BANNER, backgroundColor: colors.primary, overflow: 'hidden' },
  bubble: { position: 'absolute', borderRadius: 999 },
  bubbleA: { width: 180, height: 180, top: -90, right: -40, backgroundColor: 'rgba(255,255,255,0.12)' },
  bubbleB: { width: 120, height: 120, top: 20, right: 90, backgroundColor: 'rgba(124,58,237,0.55)' },
  bubbleC: { width: 90, height: 90, top: -30, left: 40, backgroundColor: 'rgba(37,99,235,0.5)' },
  bannerIcon: { position: 'absolute', right: 16, bottom: 12 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  avatar: { marginTop: -46, marginBottom: 8, alignSelf: 'flex-start' },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  headline: { fontSize: 14, color: colors.text, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: radius.pill },
  actionPrimary: { backgroundColor: colors.primary },
  actionOutline: { borderWidth: 1.5, borderColor: colors.primary },
  actionPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionOutlineText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  pressed: { opacity: 0.7 },
});
