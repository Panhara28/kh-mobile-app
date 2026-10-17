import { ApiError, type MenuProduct, type OrderLine, type RestaurantTable, type TableOrder } from './api';
import { addToTable, kitchenMoves, lineExtras, lineStarted, lineTimes, mergeTarget, modifierNames, orderCounts, pendingQty, serveMoves } from './order';

const line = (id: string, variantId: string, status: Record<string, number>, mods: OrderLine['orderModifiers'] = []): OrderLine => ({
  orderDetailId: id,
  variantId,
  title: 'X (Regular)',
  qty: Object.values(status).reduce((a, b) => a + b, 0),
  price: '1.00',
  totalAmount: '1.00',
  status: Object.entries(status).map(([s, qty]) => ({ status: s as 'pending', qty })),
  orderModifiers: mods,
});

const order = (items: OrderLine[]): TableOrder => ({ orderId: 'o1', invoiceNo: 1, totalAmount: '0', items });

describe('order helpers', () => {
  it('counts portions per kitchen status, ignoring emptied lines', () => {
    const o = order([line('a', 'v1', { pending: 2, cooking: 1 }), line('b', 'v2', { served: 3 }), line('c', 'v3', { pending: 0 })]);
    expect(orderCounts(o)).toEqual({ lines: 2, portions: 6, pending: 2, cooking: 1, served: 3 });
    expect(orderCounts(null)).toEqual({ lines: 0, portions: 0, pending: 0, cooking: 0, served: 0 });
  });

  it('sends every pending portion to the kitchen', () => {
    const o = order([line('a', 'v1', { pending: 2, cooking: 1 }), line('b', 'v2', { cooking: 2 }), line('c', 'v3', { pending: 1 })]);
    expect(kitchenMoves(o)).toEqual([
      { orderDetailId: 'a', fromStatus: 'pending', toStatus: 'cooking', qty: 2 },
      { orderDetailId: 'c', fromStatus: 'pending', toStatus: 'cooking', qty: 1 },
    ]);
  });

  it('knows when the kitchen has started a line', () => {
    expect(lineStarted(line('a', 'v', { pending: 2 }))).toBe(false);
    expect(lineStarted(line('a', 'v', { pending: 2, cooking: 1 }))).toBe(true);
    expect(lineStarted(line('a', 'v', { pending: 1, cooking: 0 }))).toBe(false);
  });

  it('adds to the same plain dish whatever its kitchen status, like the web POS', () => {
    const o = order([
      line('served', 'v1', { served: 1 }),
      line('cooking', 'v4', { cooking: 2 }),
      line('withNote', 'v2', { pending: 1 }, [{ orderDetailId: 'withNote', modifierItemId: 'notes', notes: 'x' }]),
      line('plain', 'v3', { pending: 2 }),
    ]);
    const p = (variantId: string) => ({ variantId, price: '5.00', discountedPrice: null });
    expect(mergeTarget(o, p('v1'))?.orderDetailId).toBe('served');
    expect(mergeTarget(o, p('v4'))?.orderDetailId).toBe('cooking');
    expect(mergeTarget(o, p('v2'))).toBeNull(); // only line has a note
    expect(mergeTarget(o, p('v3'))?.orderDetailId).toBe('plain');
    expect(mergeTarget(null, p('v3'))).toBeNull();
  });

  it('with the branch discount cap on, a discounted dish only joins a line whose discount is used up', () => {
    const discounted = { variantId: 'v1', price: '5.00', discountedPrice: 4 };
    const used = { ...line('used', 'v1', { served: 2 }), discounts: [{ discountId: 'variant', name: 'Menu', amount: 0 }] };
    const live = { ...line('live', 'v1', { pending: 1 }), discounts: [{ discountId: 'variant', name: 'Menu', amount: 1 }] };
    expect(mergeTarget(order([live]), discounted, true)).toBeNull(); // new full-price line
    expect(mergeTarget(order([live, used]), discounted, true)?.orderDetailId).toBe('used');
    expect(mergeTarget(order([live]), discounted, false)?.orderDetailId).toBe('live'); // cap off: stack as usual
    expect(mergeTarget(order([live]), { ...discounted, discountedPrice: null }, true)?.orderDetailId).toBe('live'); // no menu discount
  });

  it('describes options and notes with names from the menu', () => {
    const products = [
      { productId: 'p', variantId: 'v', productTitle: 'Rice', modifiers: [{ modifierId: 'm', title: 'Add-ons', items: [{ id: 'egg', modifierId: 'm', name: 'Fried egg', price: 0.5 }] }] },
    ] as MenuProduct[];
    const l = line('a', 'v', { pending: 1 }, [
      { orderDetailId: 'a', modifierItemId: 'egg', price: 0.5 },
      { orderDetailId: 'a', modifierItemId: 'notes', notes: ' no chili ' },
    ]);
    expect(lineExtras(l, modifierNames(products))).toEqual({ options: ['Fried egg'], note: 'no chili' });
  });
});

describe('addToTable (same steps as the kh-pos web POS)', () => {
  const product = { productId: 'p1', variantId: 'v1', productTitle: 'Fried Rice (Regular)', price: '3.00' } as MenuProduct;
  const egg = { id: 'egg', modifierId: 'm', name: 'Fried egg', price: 0.5 };
  const freeTable = (o: TableOrder | null = null, status: RestaurantTable['status'] = 'available'): RestaurantTable => ({
    id: 't1', table_name: 'Table 1', setting_capacity: 4, section: null, status, order: o,
  });

  function fakeApi(overrides: Partial<Record<string, (...a: never[]) => Promise<unknown>>> = {}) {
    const calls: [string, unknown][] = [];
    const rec = (name: string, result?: unknown) => async (...args: unknown[]) => {
      calls.push([name, args.length > 1 ? args : args[0]]);
      return result;
    };
    const api = {
      table: rec('table', freeTable()),
      setTableStatus: rec('setTableStatus'),
      posInfo: rec('posInfo', { posSlotId: 's1', posCustomerId: 'c1' }),
      nextInvoiceNumber: rec('nextInvoiceNumber', 2026101700001),
      createOrder: rec('createOrder', 'o1'),
      addLine: rec('addLine'),
      addModifier: rec('addModifier'),
      setPendingQty: rec('setPendingQty'),
      ...overrides,
    };
    return { api: api as never, calls };
  }
  let n = 0;
  const newId = () => `line${++n}`;
  beforeEach(() => (n = 0));

  it('opens the order on a free table: table taken, invoice number, order with the line, then options and note', async () => {
    const { api, calls } = fakeApi();
    await addToTable(api, { table: freeTable(), warehouseId: 'w1', product, qty: 2, options: [egg], note: ' no chili ' }, newId);
    expect(calls.map((c) => c[0])).toEqual(['setTableStatus', 'posInfo', 'nextInvoiceNumber', 'createOrder', 'addModifier', 'addModifier']);
    expect(calls[3]![1]).toEqual({
      warehouseId: 'w1', tableId: 't1', posInfo: { posSlotId: 's1', posCustomerId: 'c1' }, invoiceNo: 2026101700001,
      line: { id: 'line1', variantId: 'v1', qty: 2, price: 3 },
    });
    expect(calls[4]![1]).toEqual(['o1', { orderDetailId: 'line1', modifierItemId: 'egg', price: 0.5 }]);
    expect(calls[5]![1]).toEqual(['o1', { orderDetailId: 'line1', modifierItemId: 'notes', price: 0, notes: 'no chili' }]);
  });

  it('raises the pending quantity of the same plain item', async () => {
    const { api, calls } = fakeApi();
    const o = order([line('a', 'v1', { pending: 2 })]);
    await addToTable(api, { table: freeTable(o, 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId);
    expect(calls).toEqual([['setPendingQty', ['o1', 'a', 3]]]);
  });

  it('adds one more pending portion to a line already served or cooking', async () => {
    const { api, calls } = fakeApi();
    await addToTable(api, { table: freeTable(order([line('a', 'v1', { served: 1 })]), 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId);
    await addToTable(api, { table: freeTable(order([line('b', 'v1', { pending: 1, cooking: 2 })]), 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId);
    expect(calls).toEqual([
      ['setPendingQty', ['o1', 'a', 1]],
      ['setPendingQty', ['o1', 'b', 2]],
    ]);
  });

  it('starts a new line when the dish gets options or a note', async () => {
    const { api, calls } = fakeApi();
    await addToTable(api, { table: freeTable(order([line('b', 'v1', { pending: 1 })]), 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [egg], note: '' }, newId);
    expect(calls.map((c) => c[0])).toEqual(['addLine', 'addModifier']);
  });

  it('adds to the order another phone opened a moment earlier', async () => {
    const theirs = order([]);
    const { api, calls } = fakeApi({
      createOrder: async () => {
        throw new ApiError('server', 500, 'Table already have an active order');
      },
      table: async () => freeTable(theirs, 'order_taken'),
    });
    await addToTable(api, { table: freeTable(), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId);
    expect(calls.map((c) => c[0])).toEqual(['setTableStatus', 'posInfo', 'nextInvoiceNumber', 'addLine']);
  });

  it('takes a fresh invoice number when another table got the same one', async () => {
    let creates = 0;
    const { api, calls } = fakeApi({
      createOrder: async () => {
        if (++creates === 1) throw new ApiError('server', 500, "Duplicate entry 'w1-2026101700004' for key 'customer_order.unique_warehouse_invoice_no'");
        return 'o2';
      },
      table: async () => freeTable(null, 'order_taken'), // this table is still free
    });
    await addToTable(api, { table: freeTable(), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId);
    expect(creates).toBe(2);
    expect(calls.filter((c) => c[0] === 'nextInvoiceNumber')).toHaveLength(2);
  });

  it('gives up after three clashes and does not retry other errors', async () => {
    const clash = fakeApi({
      createOrder: async () => {
        throw new ApiError('server', 500, 'Duplicate entry for key unique_warehouse_invoice_no');
      },
    });
    await expect(addToTable(clash.api, { table: freeTable(), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId)).rejects.toThrow(/Duplicate/);
    expect(clash.calls.filter((c) => c[0] === 'nextInvoiceNumber')).toHaveLength(3);

    const other = fakeApi({
      createOrder: async () => {
        throw new ApiError('server', 500, 'This branch has no POS slot');
      },
    });
    await expect(addToTable(other.api, { table: freeTable(), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId)).rejects.toThrow(/POS slot/);
    expect(other.calls.filter((c) => c[0] === 'nextInvoiceNumber')).toHaveLength(1);
  });

  it('reuses the POS info once fetched', async () => {
    const { api, calls } = fakeApi();
    const cache = {};
    await addToTable(api, { table: freeTable(null, 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId, cache);
    await addToTable(api, { table: freeTable(null, 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId, cache);
    expect(calls.filter((c) => c[0] === 'posInfo')).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'setTableStatus')).toHaveLength(0);
  });

  it('pendingQty reads the pending status', () => {
    expect(pendingQty(line('a', 'v', { pending: 3, cooking: 1 }))).toBe(3);
  });
});

describe('serve all and line times', () => {
  it('serves every preparing portion', () => {
    const o = order([line('a', 'v1', { cooking: 2, pending: 1 }), line('b', 'v2', { served: 1 }), line('c', 'v3', { cooking: 1 })]);
    expect(serveMoves(o)).toEqual([
      { orderDetailId: 'a', fromStatus: 'cooking', toStatus: 'served', qty: 2 },
      { orderDetailId: 'c', fromStatus: 'cooking', toStatus: 'served', qty: 1 },
    ]);
  });

  it('sent = first printed kitchen ticket, else when it went to cooking; served once served', () => {
    const withTimes = (status: Record<string, [number, string]>, printed: string[] = []): OrderLine => ({
      ...line('a', 'v', Object.fromEntries(Object.entries(status).map(([s, [q]]) => [s, q]))),
      createdAt: '2026-10-17 23:13:46',
      status: Object.entries(status).map(([s, [qty, at]]) => ({ status: s as 'pending', qty, createdAt: at })),
      kitchenLogs: printed.map((printedAt) => ({ printedAt })),
    });
    expect(lineTimes(withTimes({ pending: [1, '2026-10-17 23:13'] }))).toEqual({ ordered: '2026-10-17 23:13:46', sent: null, served: null });
    expect(lineTimes(withTimes({ pending: [0, '2026-10-17 23:13'], cooking: [1, '2026-10-17 23:20'] })).sent).toBe('2026-10-17 23:20');
    // kh-pos keeps the cooking time when the item is served, so sent stays 23:20.
    expect(lineTimes(withTimes({ cooking: [0, '2026-10-17 23:20'], served: [1, '2026-10-17 23:31'] }))).toEqual({
      ordered: '2026-10-17 23:13:46', sent: '2026-10-17 23:20', served: '2026-10-17 23:31',
    });
    // A printed kitchen ticket wins (first one).
    expect(lineTimes(withTimes({ cooking: [1, '2026-10-17 23:29'] }, ['2026-10-17 23:25', '2026-10-17 23:21'])).sent).toBe('2026-10-17 23:21');
  });
});
