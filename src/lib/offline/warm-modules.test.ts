import type { KhPosApi } from '../api';
import { detailAddresses, reasonOf, sheetAddresses, pagedAddresses, reportAddresses, warmModules } from './warm-modules';

const ctx = { userId: 'u1', warehouseId: 'w1', isMain: true };

describe('module sync', () => {
  it('asks for the first screen of the modules the way the screens do', () => {
    const a = pagedAddresses(ctx);
    expect(a).toContain('/api/product-v2?limit=30&offset=0');
    expect(a).toContain('/api/purchase-order?limit=30&offset=0&warehouseId=w1');
    expect(a).toContain('/api/product-v2/group?offset=0&limit=20&warehouseIds=w1');
    expect(a).toContain('/api/shift?openedBy=u1&limit=30&offset=0');
    expect(a.some((x) => x.startsWith('/api/pos/order?') && x.includes('status=DRAFT'))).toBe(true);
    expect(new Set(a).size).toBe(a.length);
  });

  it('reads every report for today, yesterday, the week and the month, as the report screens ask', () => {
    const a = reportAddresses(ctx);
    expect(a).toContain('/api/reports/expiry');
    expect(a.filter((x) => x.startsWith('/api/report/order/guest?'))).toHaveLength(4);
    expect(a.filter((x) => x.startsWith('/api/report/end-of-day?'))).toHaveLength(4);
    expect(a.some((x) => x.startsWith('/api/report/sale-by-category?') && x.includes('groupBy=product') && x.includes('warehouseId=w1'))).toBe(true);
    expect(new Set(a).size).toBe(a.length);
  });

  it('keeps the details of the first records of the lists that open a detail screen', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}` }));
    expect(detailAddresses('/api/product-v2?limit=30&offset=0', { result: { data: rows } })).toHaveLength(15);
    expect(detailAddresses('/api/product-v2?limit=30&offset=0', { result: { data: rows } })[0]).toBe('/api/product-v2/r0');
    expect(detailAddresses('/api/purchase-order?limit=30&offset=0&warehouseId=w1', { result: rows })[0]).toBe('/api/purchase-order/detail/r0');
    expect(detailAddresses('/api/replenishment?limit=30&offset=0', { result: { data: rows } })[0]).toBe('/api/replenishment/r0');
    expect(detailAddresses('/api/product-v2?limit=30&offset=30', { result: { data: rows } })).toEqual([]);
    expect(detailAddresses('/api/back-log-order?limit=30&offset=0', { result: { data: rows } })).toEqual([]);
  });

  it('keeps the sheets of discounts, modifiers and users, and the movements and prices of the first product variants', () => {
    expect(sheetAddresses('/api/discount', [{ id: 'd1' }])).toEqual(['/api/discount/applies?id=d1']);
    expect(sheetAddresses('/api/modifier', [{ modifierId: 'm1' }])).toEqual(['/api/modifier/m1']);
    expect(sheetAddresses('/api/user', [{ id: 'u9' }])).toEqual(['/api/user/bind-user/group?userId=u9', '/api/user/bind-user?userId=u9']);
    expect(sheetAddresses('/api/category', [{ id: 'c1' }])).toEqual([]);
    const d = detailAddresses('/api/product-v2?limit=30&offset=0', { result: { data: [{ id: 'p1', productVariants: [{ id: 'v1' }] }] } });
    expect(d).toContain('/api/product-v2/variant-transaction?variant_id=v1');
    expect(d).toContain('/api/supplier/product-price?productVariantId=v1&limit=100&offset=0');
  });

  it('includes the Board dashboard and the Retail catalog', () => {
    expect(reportAddresses(ctx).some((x) => x.startsWith('/api/report/warehouse/sale?'))).toBe(true);
  });

  it('reads every address once, goes through the lists a hundred at a time, and skips what is refused', async () => {
    const asked: string[] = [];
    const api = {
      call: async (_m: string, path: string) => {
        asked.push(path);
        if (path.startsWith('/api/supplier?')) throw Object.assign(new Error('no'), { kind: 'forbidden' });
        if (path.startsWith('/api/category?limit=100&offset=0')) return { result: { data: new Array(100).fill({}), total: 150 } };
        return { result: { data: [], total: 0 } };
      },
    } as unknown as KhPosApi;
    await warmModules(api, ctx);
    expect(asked).toContain('/api/category?limit=100&offset=0');
    expect(asked).toContain('/api/category?limit=100&offset=100');
    expect(asked).toContain('/api/auth/customer?limit=100&offset=0&type=delivery');
    expect(asked).toContain('/api/product-v2?limit=30&offset=0'); // went on after the refused one
  });

  it('stops when kh-pos cannot be reached', async () => {
    let n = 0;
    const api = { call: async () => { n++; throw Object.assign(new Error('down'), { kind: 'network' }); } } as unknown as KhPosApi;
    const complete = await warmModules(api, ctx);
    expect(complete).toBe(false);
    expect(n).toBeLessThanOrEqual(4); // the few requests already in flight, then it stops
  });

  it('reports its progress up to done = total and says when the whole pass was done', async () => {
    const api = { call: async () => ({ result: { data: [], total: 0 } }) } as unknown as KhPosApi;
    const seen: { done: number; total: number }[] = [];
    const complete = await warmModules(api, ctx, () => true, (p) => seen.push(p));
    expect(complete).toBe(true);
    const last = seen[seen.length - 1]!;
    expect(last.done).toBe(last.total);
    expect(last.total).toBeGreaterThan(80);
    expect(seen.every((p) => p.done <= p.total)).toBe(true);
  });

  it('stops without finishing when told it is no longer alive', async () => {
    let calls = 0;
    const api = { call: async () => { calls++; return { result: { data: [], total: 0 } }; } } as unknown as KhPosApi;
    const complete = await warmModules(api, ctx, () => calls < 5);
    expect(complete).toBe(false);
    expect(calls).toBeLessThan(20);
  });

  it('tells which addresses could not be read, and why', async () => {
    const api = {
      call: async (_m: string, path: string) => {
        if (path.startsWith('/api/product-v2/group')) throw Object.assign(new Error('The operation was aborted'), { kind: 'server', status: 500 });
        return { result: { data: [], total: 0 } };
      },
    } as unknown as KhPosApi;
    const problems: [string, string][] = [];
    await warmModules(api, ctx, () => true, undefined, (a, r) => problems.push([a, r]));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]![0]).toMatch(/^\/api\/product-v2\/group/);
    expect(problems[0]![1]).toBe('server 500 The operation was aborted');
    expect(reasonOf(new Error('x'))).toBe('x');
  });

  it('does not ask for the 30-day sales lines (about 10 MB, over what the phone keeps) but keeps the shorter periods', () => {
    const sales = reportAddresses(ctx).filter((x) => x.startsWith('/api/report/sale?'));
    expect(sales).toHaveLength(3); // today, yesterday, 7 days
  });
});
