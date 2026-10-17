import { ApiError, type MenuProduct, type OrderLine, type RestaurantTable, type TableOrder } from './api';
import { addToTable, kitchenMoves, lineExtras, lineStarted, mergeTarget, modifierNames, orderCounts, pendingQty } from './order';

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

  it('merges only into a plain, still-pending, not-started line of the same item', () => {
    const o = order([
      line('started', 'v1', { pending: 1, cooking: 1 }),
      line('withNote', 'v2', { pending: 1 }, [{ orderDetailId: 'withNote', modifierItemId: 'notes', notes: 'x' }]),
      line('plain', 'v3', { pending: 2 }),
    ]);
    expect(mergeTarget(o, 'v1')).toBeNull();
    expect(mergeTarget(o, 'v2')).toBeNull();
    expect(mergeTarget(o, 'v3')?.orderDetailId).toBe('plain');
    expect(mergeTarget(null, 'v3')).toBeNull();
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

  it('starts a new line when the item has options, or is already in the kitchen', async () => {
    const { api, calls } = fakeApi();
    const o = order([line('a', 'v1', { pending: 0, cooking: 2 })]);
    await addToTable(api, { table: freeTable(o, 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [], note: '' }, newId);
    await addToTable(api, { table: freeTable(order([line('b', 'v1', { pending: 1 })]), 'order_taken'), warehouseId: 'w1', product, qty: 1, options: [egg], note: '' }, newId);
    expect(calls.map((c) => c[0])).toEqual(['addLine', 'addLine', 'addModifier']);
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
