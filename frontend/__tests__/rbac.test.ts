import { groupByDayLabel } from '@/features/rbac/audit';
import { can, roleColor, useAccess } from '@/features/rbac/store';
import type { AuditEntry } from '@/types';

describe('can', () => {
  it('follows the permissions the server sent', () => {
    useAccess.setState({ role: 'user', suspended: false, permissions: ['calls.view', 'contacts.view'] });
    expect(can('contacts.view')).toBe(true);
    expect(can('contacts.block')).toBe(false);
    expect(can('team.manage')).toBe(false);
  });

  it('allows nothing while the account is suspended', () => {
    useAccess.setState({ role: 'admin', suspended: true, permissions: ['calls.view', 'team.manage'] });
    expect(can('calls.view')).toBe(false);
    expect(can('team.manage')).toBe(false);
  });

  it('forgets everything on sign-out', () => {
    useAccess.setState({ role: 'admin', roleLabel: 'Admin' });
    useAccess.getState().clear();
    expect(useAccess.getState().role).toBe('user');
    expect(useAccess.getState().loaded).toBe(false);
  });
});

describe('roles', () => {
  it('gives built-in roles fixed colours and custom roles one shared colour', () => {
    expect(roleColor('super_admin')).not.toBe(roleColor('admin'));
    expect(roleColor('supervisor')).toBe(roleColor('viewer'));
  });
});

describe('audit log', () => {
  it('groups entries by day', () => {
    const now = new Date(2026, 9, 21, 15, 0);
    const entry = (id: string, at: Date): AuditEntry => ({ id, at: at.toISOString(), actorId: null, actorName: 'A', action: 'role.changed', targetId: null, targetName: 'B', detail: '' });
    const sections = groupByDayLabel([entry('1', new Date(2026, 9, 21, 9)), entry('2', new Date(2026, 9, 21, 8)), entry('3', new Date(2026, 9, 20, 9))], now);
    expect(sections.map((s) => [s.title, s.data.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ]);
  });
});
