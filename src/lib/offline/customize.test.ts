import type { OrderLine, RestaurantTable } from '../api';
import { activeLines, pendingQty, statusQty } from '../order';
import { SyncEngine } from './engine';
import { dish, FakeServer } from './fake-server';
import { MemoryStore } from './memory-store';
import { applyOutbox } from './overlay';
import type { AddLinePayload, CommandKind, NewCommand, OutboxCommand } from './types';

/**
 * Customize Your Order works without kh-pos too: every action is kept and replayed later, and is
 * shown on screen at once. These tests cover both halves for each action.
 */

const USER = 'u1';
let n = 0;

const cmd = (kind: CommandKind, payload: unknown, extra: Partial<OutboxCommand> = {}): OutboxCommand =>
  ({ id: `x${++n}`, userId: USER, kind, tableId: 't1', payload, status: 'pending', attempts: 0, createdAt: 1_760_000_000_000, seq: n, ...extra }) as OutboxCommand;
const newCmd = (kind: CommandKind, payload: unknown): NewCommand => ({ id: `y${++n}`, userId: USER, kind, tableId: 't1', createdAt: 1, payload }) as NewCommand;
const add = (lineId: string, variant: string, qty = 1): NewCommand =>
  newCmd('addLine', { lineId, product: dish(variant), qty, options: [], note: '', warehouseId: 'w1', capEnabled: false } satisfies AddLinePayload);

function setup() {
  const server = new FakeServer(['t1']);
  const engine = new SyncEngine(server.api, new MemoryStore());
  engine.setUser(USER);
  return { server, engine };
}
async function queue(engine: SyncEngine, ...cmds: NewCommand[]) {
  engine.setOnline(false); // keep any background sync from starting
  for (const c of cmds) await engine.enqueue(c);
}
const seedOrder = (server: FakeServer) =>
  server.api.createOrder({ warehouseId: 'w1', tableId: 't1', posInfo: { posSlotId: 's', posCustomerId: 'c' }, invoiceNo: 1, line: { id: 'S1', variantId: 'v1', qty: 1, price: 2 } });

describe('replay: Customize Your Order actions', () => {
  it('prepares and serves a line made offline, and edits its option, note, discount and promotion', async () => {
    const { server, engine } = setup();
    await queue(
      engine,
      add('L1', 'v1', 3),
      newCmd('moveStatus', { orderDetailId: 'L1', from: 'pending', to: 'cooking', qty: 3 }),
      newCmd('moveStatus', { orderDetailId: 'L1', from: 'cooking', to: 'served', qty: 2 }),
      newCmd('setOption', { orderDetailId: 'L1', modifierItemId: 'm1', name: 'Egg', price: 0.5, on: true }),
      newCmd('setNote', { orderDetailId: 'L1', notes: 'no chili', price: 0 }),
      newCmd('setDiscount', { orderDetailId: 'L1', amount: 10, discountType: 'PERCENTAGE' }),
      newCmd('setPromotion', { orderDetailId: 'L1', discountId: 'promo1', name: 'Happy hour', on: true }),
    );
    await engine.flush();
    expect(engine.getState().failed).toBe(0);
    expect(server.summary()).toEqual(['v1×3(0/1)']); // 1 preparing, 2 served
    const line = server.tables.t1!.order!.items![0]!;
    expect(line.status!.find((s) => s.status === 'served')!.qty).toBe(2);
    expect(line.orderModifiers!.map((m) => m.modifierItemId).sort()).toEqual(['m1', 'notes']);
    expect(line.discounts!.map((d) => d.discountId).sort()).toEqual(['manual', 'promo1']);
  });

  it('edits the counts of a line, then turns an option and a promotion off again', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await server.api.addModifier('order-t1', { orderDetailId: 'S1', modifierItemId: 'm1', price: 0.5 });
    await server.api.addPromotion('order-t1', { itemId: 'S1', discountId: 'p1' });
    await queue(
      engine,
      newCmd('setStatus', { orderDetailId: 'S1', status: 'served', qty: 2 }),
      newCmd('setOption', { orderDetailId: 'S1', modifierItemId: 'm1', name: 'Egg', price: 0.5, on: false }),
      newCmd('setPromotion', { orderDetailId: 'S1', discountId: 'p1', name: 'P', on: false }),
    );
    await engine.flush();
    const line = server.tables.t1!.order!.items![0]!;
    expect(line.status!.find((s) => s.status === 'served')!.qty).toBe(2);
    expect(line.orderModifiers).toHaveLength(0);
    expect(line.discounts).toHaveLength(0);
  });

  it('serves everything that is preparing', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1', 2), add('L2', 'v2', 1), newCmd('sendToKitchen', {}), newCmd('serveAll', {}));
    await engine.flush();
    const lines = server.tables.t1!.order!.items!;
    expect(lines.map((l) => l.status!.find((s) => s.status === 'served')?.qty)).toEqual([2, 1]);
    expect(engine.getState().failed).toBe(0);
  });

  it('turning an option on twice, or off when it is not there, is harmless', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    const on = { orderDetailId: 'S1', modifierItemId: 'm1', name: 'Egg', price: 0.5, on: true };
    await queue(engine, newCmd('setOption', on), newCmd('setOption', on), newCmd('setOption', { ...on, modifierItemId: 'other', on: false }));
    await engine.flush();
    expect(server.tables.t1!.order!.items![0]!.orderModifiers).toHaveLength(1);
    expect(engine.getState().failed).toBe(0);
  });

  it('adds a note first and updates it after', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, newCmd('setNote', { orderDetailId: 'S1', notes: 'a', price: 0 }), newCmd('setNote', { orderDetailId: 'S1', notes: 'b', price: 1 }));
    await engine.flush();
    const notes = server.tables.t1!.order!.items![0]!.orderModifiers!.filter((m) => m.modifierItemId === 'notes');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ notes: 'b', price: 1 });
  });

  it('does not move portions twice when the answer to moving them was lost', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, newCmd('moveStatus', { orderDetailId: 'S1', from: 'pending', to: 'cooking', qty: 1 }));
    server.dropAnswerOnce = true;
    await engine.flush();
    expect(engine.getState().pending).toBe(1);
    expect(server.summary()).toEqual(['v1×1(0/1)']);
    await engine.flush(); // already moved: done, not an "insufficient quantity" failure
    expect(engine.getState().failed).toBe(0);
    expect(engine.getState().pending).toBe(0);
    expect(server.summary()).toEqual(['v1×1(0/1)']);
  });

  it('marks a move failed when there are not enough portions, and carries on', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, newCmd('moveStatus', { orderDetailId: 'S1', from: 'cooking', to: 'served', qty: 1 }), add('L2', 'v2'));
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    expect(server.summary()).toEqual(['v1×1(1/0)', 'v2×1(1/0)']);
  });

  it('resends a ticket once the server is back', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, newCmd('resend', { orderDetailId: 'S1', qty: 1 }));
    await engine.flush();
    expect(server.resends).toEqual([{ orderDetailId: 'S1', qty: 1 }]);
  });

  it('fails a change to an item that is gone, without blocking the rest', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, newCmd('setNote', { orderDetailId: 'ghost', notes: 'x', price: 0 }), add('L2', 'v2'));
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    expect(server.summary()).toEqual(['v1×1(1/0)', 'v2×1(1/0)']);
  });
});

// ---- the on-screen copy ----

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
const first = (t: RestaurantTable) => activeLines(t.order)[0]!;

describe('applyOutbox: Customize Your Order actions', () => {
  const base = () => taken([serverLine('S1', 'v1', { pending: 2, cooking: 1 })]);

  it('prepares and serves portions', () => {
    const t = applyOutbox(base(), [
      cmd('moveStatus', { orderDetailId: 'S1', from: 'pending', to: 'cooking', qty: 1 }),
      cmd('moveStatus', { orderDetailId: 'S1', from: 'cooking', to: 'served', qty: 2 }),
    ]);
    const line = first(t);
    expect([pendingQty(line), statusQty(line, 'cooking'), statusQty(line, 'served')]).toEqual([1, 0, 2]);
    expect(line.qty).toBe(3);
  });

  it('never moves more portions than there are', () => {
    const t = applyOutbox(base(), [cmd('moveStatus', { orderDetailId: 'S1', from: 'pending', to: 'cooking', qty: 9 })]);
    expect([pendingQty(first(t)), statusQty(first(t), 'cooking')]).toEqual([0, 3]);
  });

  it('edits a status count, and serves everything preparing', () => {
    const t = applyOutbox(base(), [cmd('setStatus', { orderDetailId: 'S1', status: 'served', qty: 2 }), cmd('serveAll', {})]);
    expect([statusQty(first(t), 'cooking'), statusQty(first(t), 'served')]).toEqual([0, 3]);
  });

  it('changes options and the note, with the charge on the line total', () => {
    const t = applyOutbox(taken([serverLine('S1', 'v1', { pending: 2 })]), [
      cmd('setOption', { orderDetailId: 'S1', modifierItemId: 'm1', name: 'Egg', price: 0.5, on: true }),
      cmd('setNote', { orderDetailId: 'S1', notes: 'no chili', price: 1 }),
    ]);
    expect(first(t).orderModifiers!.map((m) => m.modifierItemId)).toEqual(['m1', 'notes']);
    expect(first(t).totalAmount).toBe('7'); // 4 + 0.5×2 + 1×2
    const off = applyOutbox(t, [cmd('setOption', { orderDetailId: 'S1', modifierItemId: 'm1', name: 'Egg', price: 0.5, on: false })]);
    expect(first(off).orderModifiers!.map((m) => m.modifierItemId)).toEqual(['notes']);
  });

  it('applies a manual discount (replacing the earlier one), and adds or removes a promotion', () => {
    const t1 = applyOutbox(taken([serverLine('S1', 'v1', { pending: 5 })]), [cmd('setDiscount', { orderDetailId: 'S1', amount: 10, discountType: 'PERCENTAGE' })]);
    expect(first(t1).totalAmount).toBe('9'); // 10 − 10%
    expect(first(t1).discounts![0]).toMatchObject({ discountId: 'manual', amount: 1 });
    const t2 = applyOutbox(t1, [cmd('setDiscount', { orderDetailId: 'S1', amount: 4, discountType: 'AMOUNT' })]);
    expect(first(t2).totalAmount).toBe('6');
    expect(first(t2).discounts!.filter((d) => d.discountId === 'manual')).toHaveLength(1);
    const t3 = applyOutbox(t2, [cmd('setPromotion', { orderDetailId: 'S1', discountId: 'p1', name: 'Happy hour', on: true })]);
    expect(first(t3).discounts!.map((d) => d.discountId)).toEqual(['manual', 'p1']);
    const t4 = applyOutbox(t3, [cmd('setPromotion', { orderDetailId: 'S1', discountId: 'p1', name: 'Happy hour', on: false })]);
    expect(first(t4).discounts!.map((d) => d.discountId)).toEqual(['manual']);
  });

  it('a discount of 0 removes the manual discount and gives the money back', () => {
    const t1 = applyOutbox(taken([serverLine('S1', 'v1', { pending: 5 })]), [cmd('setDiscount', { orderDetailId: 'S1', amount: 10, discountType: 'PERCENTAGE' })]);
    expect(first(t1).totalAmount).toBe('9');
    const t2 = applyOutbox(t1, [cmd('setDiscount', { orderDetailId: 'S1', amount: 0, discountType: 'PERCENTAGE' })]);
    expect(first(t2).totalAmount).toBe('10');
    expect(first(t2).discounts ?? []).toHaveLength(0);
  });

  it('works on a line made offline, in the same queue', () => {
    const t = applyOutbox(free, [
      cmd('addLine', { lineId: 'L1', product: dish('v1'), qty: 2, options: [], note: '', warehouseId: 'w1', capEnabled: false } satisfies AddLinePayload),
      cmd('moveStatus', { orderDetailId: 'L1', from: 'pending', to: 'cooking', qty: 2 }),
      cmd('setNote', { orderDetailId: 'L1', notes: 'hot', price: 0 }),
    ]);
    expect(statusQty(first(t), 'cooking')).toBe(2);
    expect(first(t).localOnly).toBe(true);
    expect(first(t).orderModifiers![0]).toMatchObject({ modifierItemId: 'notes', notes: 'hot' });
  });
});
