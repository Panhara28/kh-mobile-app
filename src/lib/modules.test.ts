import type { StaffUser } from './api';
import { can } from './line';
import { homeRoute, MODULES, sortByLabel, visibleModules } from './modules';

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

  it('hides modules the role has no entry for, as the web does, and treats view-only as read', () => {
    const limited = user('CASHIER', { shift: 'read', report: 'view-only', 'sale-report': 'view-only' });
    const ids = visibleModules(limited, () => '1').map((m) => m.id);
    expect(ids).toContain('shift');
    expect(ids).toContain('report-sale-report');
    expect(ids).not.toContain('products');
    expect(ids).not.toContain('roles');
    expect(ids).not.toContain('orders');
    expect(can(limited, 'sale-report', 'update')).toBe(false);
  });

  it('only offers the modules of the web sidebar and the profile menu', () => {
    const ids = visibleModules(user('OWNER')).map((m) => m.id);
    for (const gone of ['retail', 'customers', 'users', 'roles', 'board', 'booking', 'chart-of-accounts', 'tickets', 'showtimes', 'halls', 'promotion-sets']) expect(ids).not.toContain(gone);
    expect(ids).toEqual(expect.arrayContaining(['tables', 'orders', 'products', 'purchase-orders', 'replenishment', 'report-dashboard', 'suppliers', 'account']));
  });

  it('lets any signed-in staff use accounting, as the web does', () => {
    expect(can(user('CASHIER'), 'accounting', 'create')).toBe(true);
    expect(can(user('CASHIER'), 'accounting', 'delete')).toBe(true);
    expect(can(null, 'accounting', 'read')).toBe(false);
  });
});

describe('where the app opens', () => {
  it('the dashboard for the owner and anyone who may see it, otherwise the first module or More', () => {
    expect(homeRoute(user('OWNER'))).toBe('/report/dashboard');
    expect(homeRoute(user('Manager', { dashboard: 'read' }))).toBe('/report/dashboard');
    expect(homeRoute(user('Service', { restaurant: 'read', order: 'read' }))).toBe('/tables');
    expect(homeRoute(user('Supervisor', { shift: 'read' }))).toBe('/shift');
    expect(homeRoute(user('Nobody', {}))).toBe('/more');
    expect(homeRoute(null)).toBe('/more');
  });
});

describe('sortByLabel', () => {
  it('sorts A to Z by label without changing the list it was given', () => {
    const items = [{ n: 'Suppliers' }, { n: 'Orders' }, { n: 'Products' }];
    expect(sortByLabel(items, (i) => i.n).map((i) => i.n)).toEqual(['Orders', 'Products', 'Suppliers']);
    expect(items[0]!.n).toBe('Suppliers');
  });
});
