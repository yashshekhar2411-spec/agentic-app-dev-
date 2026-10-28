import { api } from '@/services/api/client';
import type { AuditEntry, Caller, Catalog, Invite, Member, PermissionId, SuperAdminEntry } from '@/types';

export const fetchMyAccess = () => api<Caller>('/rbac/me');

export const fetchCatalog = () => api<Catalog>('/rbac/catalog');

// Roles: super admins only
export const createRole = (body: { label: string; description?: string; permissions: PermissionId[] }) =>
  api<Catalog>('/rbac/roles', { method: 'POST', body });

export const updateRole = (roleId: string, body: { label?: string; description?: string; permissions?: PermissionId[] }) =>
  api<Catalog>(`/rbac/roles/${roleId}`, { method: 'PATCH', body });

export const resetRole = (roleId: string) => api<Catalog>(`/rbac/roles/${roleId}/reset`, { method: 'POST' });

export const deleteRole = (roleId: string) => api<Catalog>(`/rbac/roles/${roleId}`, { method: 'DELETE' });

// Team
export const fetchMembers = () => api<Member[]>('/rbac/members');

/** A permission set to null goes back to what the person's role gives. */
export type GrantChange = { allow: boolean; expiresInHours?: number } | null;

export const updateMember = (humanId: string, body: { role?: string; grants?: Partial<Record<PermissionId, GrantChange>> }) =>
  api<Member>(`/rbac/members/${humanId}`, { method: 'PATCH', body });

export const suspendMember = (humanId: string) => api<Member>(`/rbac/members/${humanId}/suspend`, { method: 'POST' });

export const reactivateMember = (humanId: string) => api<Member>(`/rbac/members/${humanId}/reactivate`, { method: 'POST' });

export const replaceMember = (humanId: string, replacementId: string) =>
  api<Member[]>(`/rbac/members/${humanId}/replace`, { method: 'POST', body: { replacementId } });

// Invites
export const fetchInvites = () => api<Invite[]>('/rbac/invites');

export const createInvite = (email: string, role: string) => api<Invite>('/rbac/invites', { method: 'POST', body: { email, role } });

export const revokeInvite = (inviteId: string) => api<Invite>(`/rbac/invites/${inviteId}/revoke`, { method: 'POST' });

// Removes finished invites and ones no longer needed; returns what's left
export const clearInvites = () => api<Invite[]>('/rbac/invites/clear', { method: 'POST' });

// Super admins: the owner(s) from the server settings, plus emails made super admin from the app (no invite)
export const fetchSuperAdmins = () => api<SuperAdminEntry[]>('/rbac/super-admins');

export const addSuperAdmin = (email: string) => api<SuperAdminEntry[]>('/rbac/super-admins', { method: 'POST', body: { email } });

export const removeSuperAdmin = (email: string) => api<SuperAdminEntry[]>(`/rbac/super-admins/${encodeURIComponent(email)}`, { method: 'DELETE' });

// Audit log: super admins
export const fetchAudit = (targetId?: string) =>
  api<{ entries: AuditEntry[] }>(`/rbac/audit${targetId ? `?targetId=${encodeURIComponent(targetId)}` : ''}`);
