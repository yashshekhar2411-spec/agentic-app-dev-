// Your profile and app settings: LinkedIn-style profile card on top, Instagram-style settings list below
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Pill } from '@/components/ui/Pill';
import { useAuth } from '@/features/auth/store';
import { signOut } from '@/features/profile/session';
import { useProfile } from '@/features/profile/store';
import { AvailabilityPicker } from '@/features/profile/components/AvailabilityPicker';
import { ProfileHeader } from '@/features/profile/components/ProfileHeader';
import {
  SettingsSection,
  searchRows,
  type SettingsSectionSpec,
} from '@/features/settings/components/SettingsList';
import { StatsRow } from '@/features/profile/components/StatsRow';
import { countryFor, usePreferences, VIBRATION_PATTERNS } from '@/features/settings/store';
import { resetPassword } from '@/services/auth/firebase';
import { useLive } from '@/state/liveStore';
import { colors, radius } from '@/theme';
import { roleColor, useAccess, useCan } from '@/features/rbac/store';

const SIGN_IN_METHOD = { google: 'Google', password: 'Email & password', other: 'Firebase' } as const;

const HOW_HANDOFFS_WORK =
  'The AI answers (or places) every call first. When the caller asks for a person, or the AI can’t help, ' +
  'the caller is put on hold and every online agent gets an alert. The first to tap “Take call” has their ' +
  'phone rung, hears a short AI summary, and is connected to the caller. If nobody takes it in time, the ' +
  'caller leaves a voicemail.';

export default function SettingsScreen() {
  const user = useAuth((s) => s.user);
  const { serverUrl, human } = useProfile();
  const connected = useLive((s) => s.connected);
  const calls = useLive((s) => s.calls);
  const prefs = usePreferences();
  const role = useAccess((s) => s.role);
  const roleLabel = useAccess((s) => s.roleLabel);
  const canEditRoles = useCan('roles.manage');
  const canSeeTeam = useCan('team.view');
  const canSeeAgent = useCan('ai_agent.view');
  const canTest = useCan('simulator.use');
  const canExport = useCan('calls.export');
  const canAudit = useCan('audit.view');
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const name = human?.name || user?.name || user?.email || 'Agent';
  const country = countryFor(prefs.countryCode);
  const host = serverUrl.replace(/^https?:\/\//, '');

  const confirmSignOut = () =>
    Alert.alert('Log out?', "You'll stop getting handoff alerts on this phone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut().finally(() => setSigningOut(false));
        },
      },
    ]);

  const sendPasswordReset = () => {
    if (!user?.email) return;
    const email = user.email;
    Alert.alert('Change password?', `We'll email a reset link to ${email}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link',
        onPress: () =>
          resetPassword(email)
            .then(() => Alert.alert('Check your email', `A password reset link was sent to ${email}.`))
            .catch((e) => Alert.alert("Couldn't send the link", (e as Error).message)),
      },
    ]);
  };

  const exportHistory = () => {
    const list = Object.values(calls).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (!list.length) return Alert.alert('Nothing to export', 'There are no calls on the server yet.');
    const lines = list.map((c) => {
      const when = new Date(c.startedAt).toLocaleString();
      const dir = c.direction === 'outbound' ? 'Outgoing' : 'Incoming';
      const said = c.transcript.filter((t) => t.speaker !== 'system').map((t) => `   ${t.speaker === 'ai' ? 'AI' : 'Customer'}: ${t.text}`);
      return [`${when} · ${dir} · ${c.fromNumber} · ${c.status.replace('_', ' ')}`, ...said].join('\n');
    });
    Share.share({ title: 'Call history', message: `Agentic Call — ${list.length} calls\n\n${lines.join('\n\n')}` });
  };

  const resetPreferences = () =>
    Alert.alert(
      'Reset app settings?',
      'Alerts, calling preferences, topics and recent numbers go back to their defaults. Your account and profile stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => prefs.reset() },
      ],
    );

  const alertSummary = !prefs.vibrateOnHandoff
    ? 'Off'
    : [prefs.urgentOnly ? 'Urgent only' : 'All calls', VIBRATION_PATTERNS[prefs.vibrationStyle].label, prefs.quietHours.enabled ? 'quiet hours' : null]
        .filter(Boolean)
        .join(' · ');

  const allSections: SettingsSectionSpec[] = [
    {
      title: 'Team & access',
      footer: `You are ${/^[aeiou]/i.test(roleLabel) ? 'an' : 'a'} ${roleLabel}. What you can use comes from your role.`,
      rows: [
        ...(canSeeTeam
          ? [
              {
                key: 'team',
                icon: 'people' as const,
                iconColor: '#2563EB',
                title: 'Team & roles',
                subtitle: 'Who uses the app, their role and the modules they can use',
                keywords: 'rbac role admin super user permission access members',
                onPress: () => router.push('/team'),
              },
            ]
          : []),
        ...(canEditRoles
          ? [
              {
                key: 'roles',
                icon: 'shield-checkmark' as const,
                iconColor: '#7C3AED',
                title: 'Roles & permissions',
                subtitle: 'Edit what each role can do and create custom roles',
                keywords: 'rbac role permission matrix modules',
                onPress: () => router.push('/roles'),
              },
            ]
          : []),
        ...(canAudit
          ? [
              {
                key: 'audit',
                icon: 'document-lock' as const,
                iconColor: '#B45309',
                title: 'Audit log',
                subtitle: 'Every change to roles and access: who, what and when',
                keywords: 'audit history security log changes',
                onPress: () => router.push('/audit'),
              },
            ]
          : []),
        {
          key: 'myaccess',
          icon: 'key' as const,
          iconColor: roleColor(role),
          title: 'My access',
          value: roleLabel,
          keywords: 'role permission access',
          onPress: () => router.push('/my-access'),
        },
      ],
    },
    {
      title: 'Your account',
      rows: [
        {
          key: 'profile',
          icon: 'person',
          title: 'Agent profile',
          subtitle: human ? `${human.name} · handoffs ring ${human.phone}` : 'Add the phone number to ring when you take a call',
          keywords: 'name phone number edit',
          onPress: () => router.push('/preferences/profile'),
        },
        {
          key: 'signin',
          icon: 'key',
          iconColor: '#0891B2',
          title: `Signed in with ${user ? SIGN_IN_METHOD[user.provider] : 'Firebase'}`,
          subtitle: user?.email ?? undefined,
          keywords: 'account email google login',
        },
        ...(user?.provider === 'password'
          ? [
              {
                key: 'password',
                icon: 'lock-closed' as const,
                iconColor: '#4338CA',
                title: 'Change password',
                subtitle: 'Get a reset link by email',
                keywords: 'password reset security',
                onPress: sendPasswordReset,
              },
            ]
          : []),
      ],
    },
    {
      title: 'Notifications',
      rows: [
        {
          key: 'alerts',
          icon: 'notifications',
          iconColor: '#DB2777',
          title: 'Handoff alerts',
          subtitle: alertSummary,
          keywords: 'vibration alert sound urgent quiet hours do not disturb banner pattern test',
          onPress: () => router.push('/preferences/notifications'),
        },
      ],
    },
    {
      title: 'AI calling',
      rows: [
        {
          key: 'agent',
          icon: 'sparkles',
          iconColor: '#7C3AED',
          title: 'AI agent',
          subtitle: 'Voice, greeting, language and handoff rules',
          keywords: 'voice greeting language company name hold timeout turns persona tts',
          onPress: () => router.push('/preferences/agent'),
        },
        {
          key: 'calling',
          icon: 'keypad',
          iconColor: '#059669',
          title: 'Calling preferences',
          subtitle: [
            country ? `${country.flag} ${country.code}` : prefs.countryCode,
            `${prefs.callTopics.length} topics`,
            prefs.confirmBeforeCalling ? 'confirm on' : null,
          ]
            .filter(Boolean)
            .join(' · '),
          keywords: 'country code dial outbound topics recent numbers confirm',
          onPress: () => router.push('/preferences/calling'),
        },
        {
          key: 'test',
          icon: 'chatbubbles',
          iconColor: '#2563EB',
          title: 'Try a test call',
          subtitle: 'Type as the caller and watch the AI reply',
          keywords: 'simulator demo practice',
          onPress: () => router.push('/simulate'),
        },
      ],
    },
    {
      title: 'Connection',
      rows: [
        {
          key: 'server',
          icon: 'server',
          iconColor: '#2563EB',
          title: 'Server',
          subtitle: host,
          badge: <Pill label={connected ? 'Live' : 'Offline'} tone={connected ? 'good' : 'bad'} />,
          keywords: 'url backend ip address ngrok cloudflare network',
          onPress: () => router.push('/preferences/server'),
        },
        {
          key: 'status',
          icon: 'pulse',
          iconColor: '#059669',
          title: 'System status',
          subtitle: 'Speed, AI engine, storage and a shareable report',
          keywords: 'health diagnostics latency debug troubleshoot',
          onPress: () => router.push('/preferences/status'),
        },
      ],
    },
    {
      title: 'Data & privacy',
      rows: [
        {
          key: 'export',
          icon: 'share-outline',
          iconColor: '#0891B2',
          title: 'Export call history',
          subtitle: 'Share every call and transcript as text',
          keywords: 'download backup transcript share',
          onPress: exportHistory,
        },
        {
          key: 'reset',
          icon: 'refresh',
          iconColor: colors.danger,
          title: 'Reset app settings',
          destructive: true,
          keywords: 'defaults clear',
          onPress: resetPreferences,
        },
      ],
    },
    {
      title: 'Help & about',
      rows: [
        {
          key: 'how',
          icon: 'help-buoy',
          iconColor: '#6B7280',
          title: 'How handoffs work',
          keywords: 'help guide queue voicemail',
          onPress: () => Alert.alert('How handoffs work', HOW_HANDOFFS_WORK),
        },
        {
          key: 'version',
          icon: 'information-circle',
          iconColor: '#6B7280',
          title: 'App version',
          value: Constants.expoConfig?.version ?? '1.0.0',
          keywords: 'about build',
        },
      ],
    },
  ];

  // Rows for modules the person's role doesn't include are left out
  const hiddenRows = new Set([...(canSeeAgent ? [] : ['agent']), ...(canTest ? [] : ['test']), ...(canExport ? [] : ['export'])]);
  const sections = allSections.map((s) => ({ ...s, rows: s.rows.filter((r) => !hiddenRows.has(r.key)) }));
  const results = query.trim() ? searchRows(sections, query) : null;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ProfileHeader
        name={name}
        email={user?.email ?? null}
        photoUrl={user?.photoUrl ?? null}
        human={human}
        onEdit={() => router.push('/preferences/profile')}
        onTestCall={() => router.push('/simulate')}
      />

      <StatsRow humanId={human?.id} />

      {human ? <AvailabilityPicker status={human.status} /> : null}

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search settings"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {results ? (
        results.length ? (
          <SettingsSection title={`${results.length} result${results.length === 1 ? '' : 's'}`} rows={results} />
        ) : (
          <Text style={styles.noResults}>No settings match “{query.trim()}”</Text>
        )
      ) : (
        sections.map((s) => <SettingsSection key={s.title} {...s} />)
      )}

      <View style={styles.logoutGroup}>
        <Pressable onPress={confirmSignOut} disabled={signingOut} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
          {signingOut ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.logoutText}>Log out</Text>}
        </Pressable>
      </View>
      <Text style={styles.footer}>Agentic Call · signed in as {user?.email ?? name}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECEEF3', borderRadius: radius.md, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  noResults: { textAlign: 'center', color: colors.muted, paddingVertical: 24 },
  logoutGroup: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  logout: { paddingVertical: 15, alignItems: 'center' },
  pressed: { backgroundColor: colors.bg },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: 12, color: colors.muted },
});
