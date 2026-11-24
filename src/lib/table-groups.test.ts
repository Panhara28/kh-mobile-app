import { KhPosApi, type FetchFn, type RestaurantTable, type TableOrder } from './api';
import { groupSeat, lowestFreeTag, openGroups, seatId, splitSeat, tableModeOf, usedTags, waitingSeats } from './table-groups';

const order = (orderId: string, tagNo: string | null): TableOrder => ({ orderId, invoiceNo: 1, totalAmount: '5', items: [], tagNo });
const table = (id: string, orders: TableOrder[]): RestaurantTable => ({
  id,
  table_name: id.toUpperCase(),
  setting_capacity: 4,
  section: 'main',
  status: orders.length ? 'order_taken' : 'available',
  order: orders[0] ?? null,
  orders,
});
const typePos = (v: object) => [{ option: 'TYPE_POS', value: JSON.stringify(v), warehouse: 'w1' }];

describe('table groups ("Table + Tag" style)', () => {
  it('splits a group seat into its table and order', () => {
    expect(splitSeat(seatId('t1', 'o9'))).toEqual({ tableId: 't1', orderId: 'o9' });
    expect(splitSeat('t1')).toEqual({ tableId: 't1', orderId: null });
  });

  it('reads the table style like kh-pos-v2', () => {
    expect(tableModeOf(typePos({ system_type: 'RESTAURANT', table_mode: 'TAG', tag_count: 30 }), 'w1')).toEqual({ mode: 'TAG', tagCount: 30 });
    expect(tableModeOf(typePos({ system_type: 'MART', table_mode: 'TAG' }), 'w1').mode).toBe('NORMAL');
    expect(tableModeOf([], 'w1')).toEqual({ mode: 'NORMAL', tagCount: 50 });
  });

  it('suggests the lowest tag no open order holds, skipping refused ones', () => {
    const tables = [table('t1', [order('a', '001'), order('b', '003')]), table('t2', [order('c', '002')])];
    expect(lowestFreeTag(usedTags(tables), 50)).toBe('4');
    expect(lowestFreeTag(usedTags(tables), 50, new Set(['004']))).toBe('5');
    expect(lowestFreeTag(usedTags(tables), 3)).toBe('');
  });

  it('shows one group of a table as its own seat', () => {
    const t = table('t1', [order('a', '001'), order('b', '002')]);
    const seat = groupSeat(t, 'b');
    expect(seat.id).toBe('t1~b');
    expect(seat.order?.tagNo).toBe('002');
    expect(groupSeat(t, 'new').order).toBeNull();
    expect(openGroups({ ...t, orders: undefined })).toEqual([t.order]); // an older server: one order per table
  });

  it('finds the groups started on the phone that kh-pos has not received', () => {
    expect(waitingSeats('t1', ['t1~x', 't1~x', 't10~y', 't1', 't2~z'])).toEqual(['t1~x']);
  });
});

describe('KhPosApi with group seats', () => {
  function server(tables: RestaurantTable[], refuseTags: string[] = []) {
    const posts: Record<string, unknown>[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      const path = url.replace('http://pos.local', '');
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      let json: unknown = { success: true };
      let status = 200;
      if (path === '/api/table') json = { success: true, result: tables };
      else if (path.startsWith('/api/setting')) json = { success: true, result: typePos({ system_type: 'RESTAURANT', table_mode: 'TAG', tag_count: 50 }) };
      else if (path === '/api/pos/order') {
        posts.push(body);
        const tag = String(body.tagNo).padStart(3, '0');
        if (refuseTags.includes(tag)) {
          status = 409;
          json = { success: false, error: `Tag ${tag} is already in use` };
        } else json = { success: true, result: body.orderId };
      }
      return { ok: status < 300, status, json: async () => json } as Response;
    }) as unknown as FetchFn;
    return { api: new KhPosApi('http://pos.local', () => 'tok', fn), posts };
  }
  const create = (api: KhPosApi, tableId: string) =>
    api.createOrder({ warehouseId: 'w1', tableId, posInfo: { posSlotId: 's', posCustomerId: 'c' }, invoiceNo: 7, line: { id: 'l1', variantId: 'v1', qty: 1, price: 2 } });

  it('opens the group order on the real table with its own id and the lowest free tag', async () => {
    const { api, posts } = server([table('t1', [order('a', '001')])]);
    expect(await create(api, 't1~g2')).toBe('g2');
    expect(posts).toEqual([expect.objectContaining({ tableNumber: 't1', orderId: 'g2', tagNo: '2' })]);
  });

  it('takes the next tag when another device just took one', async () => {
    const { api, posts } = server([table('t1', [order('a', '001')])], ['002']);
    expect(await create(api, 't1~g2')).toBe('g2');
    expect(posts.map((p) => p.tagNo)).toEqual(['2', '3']);
  });

  it('does not open a second order when an earlier try already opened it', async () => {
    const { api, posts } = server([table('t1', [order('a', '001'), order('g2', '002')])]);
    expect(await create(api, 't1~g2')).toBe('g2');
    expect(posts).toHaveLength(0);
  });

  it('a plain table still opens its order without a tag', async () => {
    const { api, posts } = server([table('t1', [])]);
    await create(api, 't1').catch(() => undefined);
    expect(posts[0]).toEqual(expect.objectContaining({ tableNumber: 't1' }));
    expect(posts[0]).not.toHaveProperty('tagNo');
  });

  it("loads a group's own order, not the table's first one", async () => {
    const { api } = server([table('t1', [order('a', '001'), order('b', '002')])]);
    expect((await api.table('t1~b')).order?.orderId).toBe('b');
    expect((await api.table('t1~new')).order).toBeNull();
  });
});
