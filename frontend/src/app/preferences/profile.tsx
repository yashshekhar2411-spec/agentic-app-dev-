// Agent profile for the signed-in account: the phone the system rings when you take over a call
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/store';
import { registerHuman } from '@/features/profile/api';
import { useAccess } from '@/features/rbac/store';
import { setMyStatus } from '@/features/profile/availability';
import { useProfile } from '@/features/profile/store';
import { Avatar } from '@/components/ui/Avatar';
import { colors, radius } from '@/theme';

export default function SetupScreen() {
  const authName = useAuth((s) => s.user?.name ?? '');
  const photoUrl = useAuth((s) => s.user?.photoUrl ?? null);
  const human = useProfile((s) => s.human);
  const [name, setName] = useState(human?.name ?? authName);
  const [phone, setPhone] = useState(human?.phone ?? '+91');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim() || !/^\+\d{8,15}$/.test(phone.trim())) {
      Alert.alert('Check your details', 'Enter your name and phone number with country code, e.g. +919876543210');
      return;
    }
    setLoading(true);
    try {
      useProfile.getState().setHuman(await registerHuman(name.trim(), phone.trim()));
      void useAccess.getState().refresh(); // signing up may have made them the first super admin
      await setMyStatus('online');
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save your profile", (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.avatar}>
        <Avatar label={name || authName || '?'} photoUrl={photoUrl} size={76} />
      </View>
      <Text style={styles.hint}>When you take a call, the system rings this phone number and connects you to the caller.</Text>
      <Text style={styles.label}>Your name</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Asha Verma" style={styles.input} />
      <Text style={styles.label}>Phone number</Text>
      <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
      <Button title={human ? 'Save' : 'Save & go online'} onPress={submit} loading={loading} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 8, backgroundColor: colors.bg },
  avatar: { alignItems: 'center', marginBottom: 8 },
  hint: { fontSize: 14, color: colors.muted, marginBottom: 12, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text, backgroundColor: colors.card },
  button: { marginTop: 20 },
});
