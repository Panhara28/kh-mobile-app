import type { OrderLine, TableOrder } from './api';
import { buildTransfer, movable, selectAll, selectedCount } from './transfer';

const line = (id: string, status: Record<string, number>): OrderLine => {
  const entries = Object.entries(status).map(([s, qty]) => ({ status: s as 'pending', qty }));
  return { orderDetailId: id, variantId: `v-${id}`, title: id, qty: entries.reduce((a, e) => a + e.qty, 0), price: '2', totalAmount: '2', status: entries };
};
const order = (items: OrderLine[]): TableOrder => ({ orderId: 'o1', invoiceNo: 1, totalAmount: '0', items });

describe('transfer', () => {
  it('lists what each line can move, leaving out cancelled and empty statuses', () => {
    expect(movable(line('a', { pending: 1, served: 2, cancelled: 3, cooking: 0 }))).toEqual([
      { status: 'pending', qty: 1 },
      { status: 'served', qty: 2 },
    ]);
  });

  it('selects the whole table', () => {
    const o = order([line('a', { pending: 1, cooking: 2 }), line('b', { served: 1 })]);
    const all = selectAll(o);
    expect(all).toEqual({ a: { pending: 1, cooking: 2 }, b: { served: 1 } });
    expect(selectedCount(all)).toBe(4);
    expect(selectAll(null)).toEqual({});
  });

  it('builds the kh-pos body, never moving more than there is', () => {
    const lines = [line('a', { pending: 1, cooking: 2 }), line('b', { served: 1 })];
    const body = buildTransfer({ orderId: 'o1', sourceTableId: 't1', destinationTableId: 't2', lines, selection: { a: { pending: 5, cooking: 1 }, b: { served: 0 } }, transferDiscount: true });
    expect(body).toEqual({
      sourceTableId: 't1',
      orderId: 'o1',
      destinationTableId: 't2',
      transferDiscount: true,
      orderItems: [{ orderItemId: 'a', variantId: 'v-a', orderItemStatuses: [{ status: 'pending', quantity: 1 }, { status: 'cooking', quantity: 1 }] }],
    });
  });

  it('builds nothing when nothing is chosen or the tables are the same', () => {
    const lines = [line('a', { pending: 1 })];
    expect(buildTransfer({ orderId: 'o', sourceTableId: 't1', destinationTableId: 't2', lines, selection: {}, transferDiscount: false })).toBeNull();
    expect(buildTransfer({ orderId: 'o', sourceTableId: 't1', destinationTableId: 't1', lines, selection: { a: { pending: 1 } }, transferDiscount: false })).toBeNull();
  });
});
