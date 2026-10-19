import type { StaffUser } from './api';
import { can } from './line';
import { MODULES, visibleModules } from './modules';

const user = (role: string, permissions: Record<string, string> = {}) => ({ id: 'u', role: { role, permissions } }) as unknown as StaffUser;

describe('which modules show', () => {
  it('every module has a unique id and route', () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map((m) => m.route)).size).toBe(MODULES.length);
  });

  it('shows what the role may read, and the owner everything', () => {
    const cashier = user('CASHIER', { shift: 'read', order: 'read,update' });
    const ids = visibleModules(cashier, () => '1').map((m) => m.id);
    expect(ids).toContain('shift');
    expect(ids).toContain('orders');
    expect(ids).toContain('account');
    expect(visibleModules(user('OWNER'), () => '1')).toHaveLength(MODULES.length);
  });

  it('hides accounting unless the branch turned it on', () => {
    const owner = user('OWNER');
    expect(visibleModules(owner, () => null).map((m) => m.id)).not.toContain('booking');
    expect(visibleModules(owner, () => '0').map((m) => m.id)).not.toContain('chart-of-accounts');
    expect(visibleModules(owner, (o) => (o === 'ACCOUNTING' ? '1' : null)).map((m) => m.id)).toEqual(expect.arrayContaining(['booking', 'chart-of-accounts']));
  });

  it('lets any signed-in staff use accounting, as the web does', () => {
    expect(can(user('CASHIER'), 'accounting', 'create')).toBe(true);
    expect(can(user('CASHIER'), 'accounting', 'delete')).toBe(true);
    expect(can(null, 'accounting', 'read')).toBe(false);
  });
});
