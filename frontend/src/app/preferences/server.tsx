// Which backend this app talks to, with a reachability test
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { env } from '@/config/env';
import { checkHealth } from '@/features/profile/api';
import { useProfile } from '@/features/profile/store';
import { Pill } from '@/components/ui/Pill';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';

type Result = { ok: true } | { ok: false; message: string };

const PRESETS = [
  { label: 'Android emulator', url: 'http://10.0.2.2:8000' },
  { label: 'Build default', url: env.DEFAULT_SERVER_URL },
].filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i);

export default function ServerScreen() {
  const { serverUrl, setServerUrl } = useProfile();
  const connected = useLive((s) => s.connected);
  const [url, setUrl] = useState(serverUrl);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Result>();

  const clean = url.trim().replace(/\/+$/, '');
  const valid = /^https?:\/\/\S+$/.test(clean);

  const saveAndTest = async () => {
    setServerUrl(clean);
    setTesting(true);
    setResult(undefined);
    try {
      await checkHealth();
      setResult({ ok: true });
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Live updates</Text>
          <Pill label={connected ? 'Connected' : 'Disconnected'} tone={connected ? 'good' : 'bad'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Server address</Text>
          <TextInput
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              setResult(undefined);
            }}
            placeholder="https://your-server.trycloudflare.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <Pressable key={p.url} onPress={() => setUrl(p.url)} style={styles.preset}>
                <Text style={styles.presetText}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {result ? (
            <View style={[styles.result, result.ok ? styles.resultOk : styles.resultBad]}>
              <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={result.ok ? colors.success : colors.danger} />
              <Text style={styles.resultText}>{result.ok ? 'Connected. The server is reachable.' : result.message}</Text>
            </View>
          ) : null}

          <Button title="Save & test" onPress={saveAndTest} loading={testing} disabled={!valid} />
          {result?.ok ? <Button title="Done" variant="secondary" onPress={() => router.back()} /> : null}
        </View>

        <View style={styles.tips}>
          <Text style={styles.tipTitle}>Which address do I use?</Text>
          <Text style={styles.tip}>• Emulator: http://10.0.2.2:8000</Text>
          <Text style={styles.tip}>• Phone on the same Wi-Fi: http://YOUR-PC-IP:8000</Text>
          <Text style={styles.tip}>• Anywhere (mobile data): your public tunnel URL, e.g. https://….trycloudflare.com</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  statusLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  presetText: { color: colors.primary, fontSize: 13, fontWeight: '500' },
  result: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radius.md, alignItems: 'flex-start' },
  resultOk: { backgroundColor: '#ECFDF5' },
  resultBad: { backgroundColor: '#FEF2F2' },
  resultText: { flex: 1, fontSize: 14, color: colors.text },
  tips: { paddingHorizontal: 4, gap: 4 },
  tipTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 2 },
  tip: { fontSize: 13, color: colors.muted },
});
