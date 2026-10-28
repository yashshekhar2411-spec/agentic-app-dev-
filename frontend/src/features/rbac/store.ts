// What the signed-in person may do: their role's permissions plus anything allowed or denied just for them.
// The server enforces every permission on every request; the app uses this to hide what they can't use.
// Saved on the phone so the right screens show while offline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { fetchMyAccess } from '@/features/rbac/api';
import { ApiError } from '@/services/api/client';
import type { PermissionId } from '@/types';

export const ALL_PERMISSIONS: PermissionId[] = [
  'calls.view', 'calls.notes', 'calls.hangup', 'calls.export', 'dialer.call', 'handoffs.view', 'handoffs.take',
  'contacts.view', 'contacts.edit', 'contacts.block', 'contacts.delete', 'scheduling.view', 'scheduling.create',
  'scheduling.campaigns', 'scheduling.cancel', 'insights.view', 'ai_agent.view', 'ai_agent.edit', 'simulator.use',
  'team.view', 'team.invite', 'team.manage', 'roles.manage', 'admins.manage', 'audit.view',
];

export const SUPER_RANK = 100;
export const ADMIN_RANK = 50;

const BUILTIN_COLOR: Record<string, string> = { super_admin: '#7C3AED', admin: '#2563EB', user: '#6B7280' };
/** Built-in roles have fixed colours; custom roles are teal. */
export const roleColor = (roleId: string) => BUILTIN_COLOR[roleId] ?? '#0D9488';

interface AccessState {
  role: string;
  roleLabel: string;
  rank: number;
  humanId: string | null;
  suspended: boolean;
  permissions: PermissionId[];
  loaded: boolean;
  changes: number; // bumps when the server says roles or someone's access changed (team screens reload on it)
  refresh: () => Promise<void>;
  clear: () => void;
}

const SIGNED_OUT = { role: 'user', roleLabel: 'User', rank: 10, humanId: null, suspended: false, permissions: ALL_PERMISSIONS, loaded: false };

export const useAccess = create<AccessState>()(
  persist(
    (set) => ({
      ...SIGNED_OUT, // until the server answers; it refuses anything not allowed anyway
      changes: 0,
      refresh: async () => {
        try {
          const me = await fetchMyAccess();
          set({ role: me.role, roleLabel: me.roleLabel, rank: me.rank, humanId: me.humanId, suspended: me.suspended, permissions: me.permissions, loaded: true });
        } catch (e) {
          // A server from before roles existed: everyone could do everything there
          if (e instanceof ApiError && e.status === 404)
            set({ role: 'super_admin', roleLabel: 'Super admin', rank: SUPER_RANK, suspended: false, permissions: ALL_PERMISSIONS, loaded: true });
          // offline: keep what we had
        }
      },
      clear: () => set(SIGNED_OUT),
    }),
    {
      name: 'agentic-access-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ role: s.role, roleLabel: s.roleLabel, rank: s.rank, humanId: s.humanId, suspended: s.suspended, permissions: s.permissions }),
    },
  ),
);

const has = (s: Pick<AccessState, 'suspended' | 'permissions'>, perm: PermissionId) => !s.suspended && s.permissions.includes(perm);

/** True if the signed-in person may do `perm` (and their account isn't suspended). */
export const useCan = (perm: PermissionId) => useAccess((s) => has(s, perm));

export const can = (perm: PermissionId) => has(useAccess.getState(), perm);

export const useIsSuperAdmin = () => useAccess((s) => s.role === 'super_admin' && !s.suspended);
