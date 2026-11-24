import { isModuleForStore, storeKind } from './business-type';
import { MODULES, visibleModules } from './modules';
import type { StaffUser } from './api';

const owner = { role: { role: 'OWNER', permissions: {} } } as unknown as StaffUser;
const settings = (typePos: string | null) => (option: string) => (option === 'TYPE_POS' ? typePos : '1');

describe('store kind (TYPE_POS)', () => {
  it('reads the type and the small-restaurant edition', () => {
    expect(storeKind('{"system_type":"RESTAURANT","edition":"LITE"}')).toEqual({ type: 'RESTAURANT', edition: 'LITE' });
    expect(storeKind('{"system_type":"RESTAURANT","edition":"FULL"}')).toEqual({ type: 'RESTAURANT', edition: 'FULL' });
    expect(storeKind('{"system_type":"MART","edition":"LITE"}')).toEqual({ type: 'MART', edition: 'FULL' });
    expect(storeKind(null)).toEqual({ type: '', edition: 'FULL' });
    expect(storeKind('not json')).toEqual({ type: '', edition: 'FULL' });
  });

  it('hides nothing when the type is unknown', () => {
    expect(MODULES.every((m) => isModuleForStore(m.id, { type: '', edition: 'FULL' }))).toBe(true);
  });
});

describe('modules per store, like the web menu', () => {
  it('a small restaurant keeps only the basics', () => {
    const ids = visibleModules(owner, settings('{"system_type":"RESTAURANT","edition":"LITE"}')).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['tables', 'orders', 'shift', 'products', 'categories', 'modifiers', 'report-dashboard', 'report-sale-report', 'settings', 'account']));
    for (const gone of ['retail', 'discounts', 'promotion-sets', 'production', 'branches', 'slots', 'stock-movements', 'product-groups', 'stock-finding', 'returns', 'backlog', 'suppliers', 'supplier-prices', 'purchase-orders', 'replenishment', 'booking', 'chart-of-accounts', 'report-guest-number', 'report-expiry', 'report-stock-report'])
      expect(ids).not.toContain(gone);
  });

  it('a full restaurant has everything but the retail counter', () => {
    const ids = visibleModules(owner, settings('{"system_type":"RESTAURANT","edition":"FULL"}')).map((m) => m.id);
    expect(ids).not.toContain('retail');
    expect(ids).toEqual(expect.arrayContaining(['tables', 'purchase-orders', 'report-guest-number', 'discounts']));
  });

  it('a mart has the retail counter and no tables', () => {
    const ids = visibleModules(owner, settings('{"system_type":"MART"}')).map((m) => m.id);
    expect(ids).toContain('retail');
    for (const gone of ['tables', 'table-setup', 'table-layout', 'report-guest-number']) expect(ids).not.toContain(gone);
  });
});
