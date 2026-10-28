// System status: is the server up, how fast, which AI and storage it runs, and a shareable report
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/store';
import { useProfile } from '@/features/profile/store';
import { fetchHealth, type Health } from '@/features/settings/api';
import { Pill } from '@/components/ui/Pill';
import { SettingsSection, type SettingsRowSpec } from '@/features/settings/components/SettingsList';
import { useLive } from '@/state/liveStore';
import { colors } from '@/theme';

type Check = { health: Health; ms: number } | { error: string };

export default function StatusScreen() {
  const serverUrl = useProfile((s) => s.serverUrl);
  const human = useProfile((s) => s.human);
  const uid = useAuth((s) => s.user?.uid);
  const connected = useLive((s) => s.connected);
  const callCount = useLive((s) => Object.keys(s.calls).length);
  const [check, setCheck] = useState<Check>();
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const started = Date.now();
    try {
      const health = await fetchHealth();
      setCheck({ health, ms: Date.now() - started });
    } catch (e) {
      setCheck({ error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void run(), [run]);

  const ok = check && 'health' in check ? check : undefined;
  const speed = ok ? (ok.ms < 300 ? 'good' : ok.ms < 1000 ? 'neutral' : 'bad') : 'bad';

  const serverRows: SettingsRowSpec[] = [
    {
      key: 'server',
      icon: 'server',
      iconColor: '#2563EB',
      title: 'Server',
      subtitle: serverUrl,
      badge: loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Pill label={ok ? 'Reachable' : 'Unreachable'} tone={ok ? 'good' : 'bad'} />,
    },
    {
      key: 'latency',
      icon: 'speedometer',
      iconColor: '#059669',
      title: 'Response time',
      badge: ok ? <Pill label={`${ok.ms} ms`} tone={speed} /> : undefined,
      value: ok ? undefined : '—',
    },
    {
      key: 'live',
      icon: 'radio',
      iconColor: '#DB2777',
      title: 'Live updates',
      badge: <Pill label={connected ? 'Connected' : 'Disconnected'} tone={connected ? 'good' : 'bad'} />,
    },
  ];

  const engineRows: SettingsRowSpec[] = ok
    ? [
        {
          key: 'ai',
          icon: 'sparkles',
          iconColor: '#7C3AED',
          title: 'AI engine',
          subtitle: ok.health.agent === 'claude' ? 'Claude answers calls' : 'Demo agent (no Anthropic API key on the server)',
          badge: <Pill label={ok.health.agent === 'claude' ? 'Claude' : 'Demo'} tone={ok.health.agent === 'claude' ? 'good' : 'neutral'} />,
        },
        {
          key: 'storage',
          icon: 'archive',
          iconColor: '#0891B2',
          title: 'Call storage',
          subtitle: ok.health.storage === 'memory' ? 'In memory: history is lost when the server restarts' : 'Database: history is kept',
          value: ok.health.storage,
        },
        { key: 'clients', icon: 'people', iconColor: '#6B7280', title: 'Apps connected now', value: String(ok.health.realtimeClients ?? 0) },
      ]
    : [];

  const report = () =>
    Share.share({
      message: [
        'Agentic Call — status report',
        `Time: ${new Date().toLocaleString()}`,
        `App: ${Constants.expoConfig?.version ?? '?'} on ${Platform.OS} ${Platform.Version}`,
        `Server: ${serverUrl}`,
        ok ? `Reachable in ${ok.ms} ms · AI ${ok.health.agent} · storage ${ok.health.storage}` : `Unreachable: ${check && 'error' in check ? check.error : '?'}`,
        `Live updates: ${connected ? 'connected' : 'disconnected'} · calls loaded: ${callCount}`,
        `Agent: ${human ? `${human.id} (${human.status})` : 'no profile'} · user ${uid ?? '?'}`,
      ].join('\n'),
    });

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={run} />}>
      {check && 'error' in check ? (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>Can’t reach the server</Text>
          <Text style={styles.errorText}>{check.error}</Text>
          <Text style={styles.errorText}>Check the address under Settings → Server, and that the backend and tunnel are running.</Text>
        </View>
      ) : null}
      <SettingsSection title="Connection" rows={serverRows} />
      <SettingsSection title="Server" rows={engineRows} />
      <SettingsSection
        title="This phone"
        rows={[
          { key: 'version', icon: 'phone-portrait', iconColor: '#6B7280', title: 'App version', value: Constants.expoConfig?.version ?? '1.0.0' },
          { key: 'calls', icon: 'call', iconColor: '#2563EB', title: 'Calls loaded', value: String(callCount) },
        ]}
      />
      <Button title="Check again" onPress={run} loading={loading} />
      <Button title="Share status report" variant="secondary" onPress={report} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 32 },
  error: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, gap: 6 },
  errorTitle: { fontWeight: '700', color: colors.danger, fontSize: 15 },
  errorText: { color: colors.text, fontSize: 13 },
});
