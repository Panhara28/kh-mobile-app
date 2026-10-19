import type { OrderLine, RestaurantTable } from '../api';
import { activeLines, orderCounts, pendingQty, statusQty } from '../order';
import { dish } from './fake-server';
import { applyOutbox, localOrderId } from './overlay';
import type { AddLinePayload, NewCommand, OutboxCommand } from './types';

let seq = 0;
function cmd<K extends OutboxCommand['kind']>(kind: K, payload: OutboxCommand<K>['payload'], extra: Partial<OutboxCommand> = {}): OutboxCommand {
  return { id: `c${++seq}`, userId: 'u', kind, tableId: 't1', payload, status: 'pending', attempts: 0, createdAt: 1_760_000_000_000, seq, ...extra } as OutboxCommand;
}
const add = (lineId: string, variant: string, qty = 1, extra: Partial<AddLinePayload> = {}) =>
  cmd('addLine', { lineId, product: dish(variant, 2), qty, options: [], note: '', warehouseId: 'w1', capEnabled: false, ...extra });

const free: RestaurantTable = { id: 't1', table_name: 'A-01', setting_capacity: 4, section: null, status: 'available', order: null };

function serverLine(id: string, variant: string, status: Record<string, number>): OrderLine {
  const entries = Object.entries(status).map(([s, qty]) => ({ status: s as 'pending', qty }));
  const qty = entries.reduce((a, e) => a + e.qty, 0);
  return { orderDetailId: id, variantId: variant, title: `Dish ${variant} (Std)`, qty, price: '2', totalAmount: String(qty * 2), status: entries, orderModifiers: [] };
}
const taken = (items: OrderLine[]): RestaurantTable => ({
  ...free,
  status: 'order_taken',
  order: { orderId: 'o1', invoiceNo: 7, totalAmount: String(items.reduce((a, l) => a + Number(l.totalAmount), 0)), items },
});

describe('applyOutbox', () => {
  it('returns the same table when nothing is waiting for it', () => {
    expect(applyOutbox(free, [])).toBe(free);
    expect(applyOutbox(free, [cmd('addLine', add('L', 'v').payload as AddLinePayload, { tableId: 'other' })])).toBe(free);
  });

  it('opens an offline order on a free table, marked as not in kh-pos yet', () => {
    const t = applyOutbox(free, [add('L1', 'v1', 2)]);
    expect(t.status).toBe('order_taken');
    expect(t.order).toMatchObject({ orderId: localOrderId('t1'), localOnly: true, totalAmount: '4' });
    const line = activeLines(t.order)[0]!;
    expect(line).toMatchObject({ orderDetailId: 'L1', qty: 2, localOnly: true, title: 'Dish v1 (Std)' });
    expect(pendingQty(line)).toBe(2);
    expect(t.pendingSync).toBe(1);
    expect(free.order).toBeNull(); // the input is not changed
  });

  it('merges the same plain dish into one line, like kh-pos does', () => {
    const t = applyOutbox(free, [add('L1', 'v1'), add('L2', 'v1'), add('L3', 'v2')]);
    const lines = activeLines(t.order);
    expect(lines.map((l) => [l.variantId, l.qty])).toEqual([
      ['v1', 2],
      ['v2', 1],
    ]);
    expect(t.order!.totalAmount).toBe('6');
  });

  it('keeps a dish with options or a note on its own line, priced with its options', () => {
    const egg = { id: 'm1', modifierId: 'g', name: 'Egg', price: 0.5 };
    const t = applyOutbox(taken([serverLine('S1', 'v1', { pending: 1 })]), [add('L2', 'v1', 2, { options: [egg], note: 'no chili' })]);
    const lines = activeLines(t.order);
    expect(lines).toHaveLength(2);
    const extra = lines[1]!;
    expect(extra.orderModifiers!.map((m) => m.modifierItemId)).toEqual(['m1', 'notes']);
    expect(extra.totalAmount).toBe('5'); // (2 + 0.5) × 2
    expect(t.order!.totalAmount).toBe('7');
  });

  it('adds to a server dish that has already been served, as a new pending portion', () => {
    const t = applyOutbox(taken([serverLine('S1', 'v1', { served: 1 })]), [add('L1', 'v1')]);
    const line = activeLines(t.order)[0]!;
    expect(statusQty(line, 'served')).toBe(1);
    expect(pendingQty(line)).toBe(1);
    expect(line.qty).toBe(2);
  });

  it('changes a pending quantity, and removes the line when it goes to 0 on a line made offline', () => {
    const base = taken([serverLine('S1', 'v1', { pending: 2, cooking: 1 })]);
    const t = applyOutbox(base, [cmd('setPending', { orderDetailId: 'S1', qty: 5 })]);
    expect(pendingQty(activeLines(t.order)[0]!)).toBe(5);
    expect(activeLines(t.order)[0]!.qty).toBe(6);

    const gone = applyOutbox(free, [add('L1', 'v1'), cmd('setPending', { orderDetailId: 'L1', qty: 0 })]);
    expect(gone.order).toBeNull();
    expect(gone.status).toBe('available');
  });

  it('removes a line; an offline order with no lines left frees the table again', () => {
    const t = applyOutbox(taken([serverLine('S1', 'v1', { pending: 1 }), serverLine('S2', 'v2', { pending: 1 })]), [cmd('removeLine', { orderDetailId: 'S1' })]);
    expect(activeLines(t.order).map((l) => l.orderDetailId)).toEqual(['S2']);
    expect(t.order!.totalAmount).toBe('2');

    const none = applyOutbox(free, [add('L1', 'v1'), cmd('removeLine', { orderDetailId: 'L1' })]);
    expect(none.order).toBeNull();
    expect(none.status).toBe('available');
  });

  it('sets the number of guests', () => {
    const t = applyOutbox(taken([serverLine('S1', 'v1', { pending: 1 })]), [cmd('setGuests', { count: 4 })]);
    expect(t.order!.customer).toBe(4);
  });

  it('shows "send to kitchen" as every pending portion now cooking', () => {
    const t = applyOutbox(taken([serverLine('S1', 'v1', { pending: 2, cooking: 1 })]), [add('L2', 'v2'), cmd('sendToKitchen', {})]);
    expect(orderCounts(t.order)).toMatchObject({ pending: 0, cooking: 4 });
  });

  it('ignores failed commands', () => {
    expect(applyOutbox(free, [{ ...add('L1', 'v1'), status: 'failed' }])).toBe(free);
  });

  it('a send after more adds only covers what is pending at that point', () => {
    const t = applyOutbox(free, [add('L1', 'v1'), cmd('sendToKitchen', {}), add('L2', 'v1')]);
    const line = activeLines(t.order)[0]!;
    expect(statusQty(line, 'cooking')).toBe(1);
    expect(pendingQty(line)).toBe(1);
  });
});

// keep the NewCommand type exercised so a change to it breaks this file, not just the engine
export const _typecheck: NewCommand | null = null;
