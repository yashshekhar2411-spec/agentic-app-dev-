// Shows a screen only to people with the permission it needs; everyone else sees who to ask.
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/ui/EmptyState';
import { useAccess, useCan } from '@/features/rbac/store';
import type { PermissionId } from '@/types';

export function Gate({ perm, children }: { perm: PermissionId; children: ReactNode }) {
  const allowed = useCan(perm);
  const { roleLabel, suspended } = useAccess();
  if (allowed) return <>{children}</>;
  if (suspended) return <EmptyState icon="ban-outline" title="Your account is suspended" hint="An admin has paused your access. Contact them to get it back." />;
  return (
    <EmptyState
      icon="lock-closed-outline"
      title="You don't have access to this"
      hint={`Your role (${roleLabel}) doesn't include it. Ask an admin to give you access in Team & roles.`}
    />
  );
}
