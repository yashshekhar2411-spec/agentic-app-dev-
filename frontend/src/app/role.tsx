// One role (super admins): turn its permissions on and off, rename or delete a custom role. Without an id:
// create a new custom role.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Gate } from '@/features/rbac/components/Gate';
import { PermissionGroups } from '@/features/rbac/components/PermissionGroups';
import { RoleBadge } from '@/features/rbac/components/RoleBadge';
import { createRole, deleteRole, fetchCatalog, resetRole, updateRole } from '@/features/rbac/api';
import { colors, radius } from '@/theme';
import type { Catalog, PermissionId } from '@/types';

const STARTERS: { label: string; perms: PermissionId[] }[] = [
  { label: 'Viewer', perms: ['calls.view', 'handoffs.view', 'contacts.view', 'scheduling.view', 'insights.view'] },
  { label: 'Agent', perms: ['calls.view', 'calls.notes', 'dialer.call', 'handoffs.view', 'handoffs.take', 'contacts.view', 'scheduling.view', 'scheduling.create'] },
  { label: 'Supervisor', perms: ['calls.view', 'calls.notes', 'calls.hangup', 'calls.export', 'handoffs.view', 'handoffs.take', 'contacts.view', 'contacts.edit', 'scheduling.view', 'scheduling.create', 'scheduling.cancel', 'insights.view', 'team.view'] },
];

function RoleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [perms, setPerms] = useState<Set<PermissionId>>(new Set());
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCatalog()
      .then((c) => {
        setCatalog(c);
        const role = c.roles.find((r) => r.id === id);
        if (role) {
          setPerms(new Set(role.permissions));
          setLabel(role.label);
          setDescription(role.description);
        }
      })
      .catch((e) => Alert.alert("Couldn't load", (e as Error).message));
  }, [id]);

  if (!catalog) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  const role = catalog.roles.find((r) => r.id === id);
  const isNew = !role;
  const locked = role?.locked ?? false;
  const original = new Set(role?.permissions ?? []);
  const dirty =
    isNew ||
    perms.size !== original.size ||
    [...perms].some((p) => !original.has(p)) ||
    (!role?.builtin && (label.trim() !== role?.label || description.trim() !== role?.description));

  const toggle = (p: PermissionId, on: boolean) =>
    setPerms((s) => {
      const next = new Set(s);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });
  const toggleGroup = (list: PermissionId[], on: boolean) => setPerms((s) => new Set(on ? [...s, ...list] : [...s].filter((p) => !list.includes(p))));

  const run = async (what: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (e) {
      Alert.alert(`Couldn't ${what}`, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    isNew
      ? run('create the role', () => createRole({ label: label.trim(), description: description.trim(), permissions: [...perms] }), () => router.back())
      : run(
          'save',
          () =>
            updateRole(role.id, {
              permissions: [...perms],
              ...(role.builtin ? {} : { label: label.trim(), description: description.trim() }),
            }),
          () => router.back(),
        );

  const remove = () =>
    Alert.alert(`Delete the ${role?.label} role?`, 'Everyone with this role becomes a User.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run('delete', () => deleteRole(role!.id), () => router.back()) },
    ]);

  const reset = () =>
    Alert.alert(`Reset ${role?.label}?`, 'Its permissions go back to the defaults.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => void run('reset', () => resetRole(role!.id), () => router.back()) },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isNew ? 'New custom role' : role.label }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {role ? <RoleBadge roleId={role.id} label={role.label} large /> : null}
        {locked ? <Text style={styles.note}>Super admins always have every permission, including the exclusive ones. This role can’t be changed.</Text> : null}

        {isNew || !role?.builtin ? (
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput value={label} onChangeText={setLabel} placeholder="e.g. Supervisor" placeholderTextColor={colors.muted} style={styles.input} maxLength={40} />
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What this role is for"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={200}
            />
            <Text style={styles.note}>Custom roles rank between Admin and User: admins can give them to people, users can’t.</Text>
          </View>
        ) : (
          <Text style={styles.note}>{role.description}</Text>
        )}

        {isNew ? (
          <View style={styles.starters}>
            <Text style={styles.label}>Start from</Text>
            <View style={styles.row}>
              {STARTERS.map((s) => (
                <Button key={s.label} title={s.label} variant="secondary" onPress={() => (setPerms(new Set(s.perms)), !label && setLabel(s.label))} style={styles.flex} />
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.count}>
          {locked ? catalog.permissions.length : perms.size} of {catalog.permissions.length} permissions
        </Text>
        <PermissionGroups
          catalog={catalog}
          isOn={(p) => locked || perms.has(p)}
          onToggle={locked ? undefined : toggle}
          onToggleGroup={locked ? undefined : toggleGroup}
          disabled={busy || locked}
        />

        {!locked ? <Button title={isNew ? 'Create role' : 'Save changes'} onPress={save} disabled={!dirty || label.trim().length < 2} loading={busy} /> : null}
        {role && role.builtin && !locked ? <Button title="Reset to defaults" variant="secondary" onPress={reset} disabled={busy} /> : null}
        {role && !role.builtin ? <Button title="Delete role" variant="danger" onPress={remove} disabled={busy} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: '#fff' },
  note: { fontSize: 13, color: colors.muted, lineHeight: 18, textAlign: 'center' },
  starters: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  count: { fontSize: 13, fontWeight: '600', color: colors.muted, paddingHorizontal: 4 },
});

export default function RoleRoute() {
  return (
    <Gate perm="roles.manage">
      <RoleScreen />
    </Gate>
  );
}
