import { ApiError, type Shift } from '../api';
import type { Receipt } from '../receipt';
import { applyShiftCommands, cashDifference, currentShift, expectedCash, receiptOf } from '../shift';
import { SyncEngine } from './engine';
import { FakeServer } from './fake-server';
import { MemoryStore } from './memory-store';
import { applyOutbox } from './overlay';
import type { NewCommand, OutboxCommand } from './types';

const USER = 'u1';
let n = 0;

const newCmd = (kind: NewCommand['kind'], payload: unknown, tableId = 't1'): NewCommand => ({ id: `s${++n}`, userId: USER, kind, tableId, createdAt: 1_760_000_000_000 + n, payload }) as NewCommand;
const asCmd = (c: NewCommand): OutboxCommand => ({ ...c, status: 'pending', attempts: 0 }) as OutboxCommand;

const receipt: Receipt = { orderId: 'o', invoiceNo: '', tableName: 'A-01', cashier: 'Staff', paidAt: null, guests: null, lines: [], total: 2, discount: 0, payments: [], change: 0, exchangeRate: 4000, currency: 'USD', offline: true };
const checkoutCmd = () => newCmd('checkout', { payments: [{ amount: 2, paymentMethod: 'cash', currency: 'USD', amountUsd: 2, exchangeRate: 4000, used: 2 }], warehouseId: 'w1', receipt });
const openCmd = () => newCmd('openShift', { openedCashUsd: 50, openedCashKhr: 100000, exchangeRate: 4000 }, '');
const closeCmd = () => newCmd('closeShift', { actualCashUsd: 52, actualCashKhr: 100000 }, '');
const addDish = (lineId: string) => newCmd('addLine', { lineId, product: { productId: 'p', variantId: 'v1', productTitle: 'Dish (Std)', price: 2 }, qty: 1, options: [], note: '', warehouseId: 'w1', capEnabled: false });

function setup() {
  const server = new FakeServer(['t1']);
  const engine = new SyncEngine(server.api, new MemoryStore());
  engine.setUser(USER);
  return { server, engine };
}
async function queue(engine: SyncEngine, ...cmds: NewCommand[]) {
  engine.setOnline(false);
  for (const c of cmds) await engine.enqueue(c);
}

describe('shifts', () => {
  it('opens a shift made offline, once, and closes it', async () => {
    const { server, engine } = setup();
    await queue(engine, openCmd());
    await engine.flush();
    expect(server.shifts.map((s) => s.status)).toEqual(['OPEN']);

    // opening again while one is open does nothing (an earlier attempt already got through)
    await queue(engine, openCmd());
    await engine.flush();
    expect(server.shifts).toHaveLength(1);

    await queue(engine, closeCmd());
    await engine.flush();
    expect(server.shifts.map((s) => s.status)).toEqual(['CLOSE']);
    expect(engine.getState().failed).toBe(0);
  });

  it('closing when nothing is open is fine', async () => {
    const { engine } = setup();
    await queue(engine, closeCmd());
    await engine.flush();
    expect(engine.getState().failed).toBe(0);
    expect(engine.getState().pending).toBe(0);
  });

  it('shows the shift as open or closed while the change is still waiting', () => {
    const user = { id: USER, fullname: 'Staff' };
    const opened = applyShiftCommands(null, [asCmd(openCmd())], user);
    expect(opened).toMatchObject({ status: 'OPEN', opened_cash_usd: '50', localOnly: true, opened_by: { id: USER } });
    expect(applyShiftCommands(opened, [asCmd(closeCmd())], user)).toBeNull();
    expect(applyShiftCommands(null, [{ ...asCmd(openCmd()), status: 'failed' }], user)).toBeNull();
  });
});

describe('shift helpers', () => {
  const shift = (over: Partial<Shift>): Shift => ({ shift_id: 's', status: 'OPEN', opened_at: null, closed_at: null, opened_cash_usd: '10', opened_cash_khr: '4000', opened_by: { id: USER }, ...over });

  it("finds the cashier's own open shift, otherwise the branch's open shift (like the web)", () => {
    const list = [shift({ shift_id: 'a', opened_by: { id: 'other' } }), shift({ shift_id: 'b', status: 'CLOSE' }), shift({ shift_id: 'c' })];
    expect(currentShift(list, USER)?.shift_id).toBe('c');
    // the owner works in the shift the cashier opened: kh-pos allows one open shift per branch
    expect(currentShift(list, 'owner')?.shift_id).toBe('a');
    expect(currentShift([shift({ status: 'CLOSE' })], 'owner')).toBeNull();
    expect(currentShift(list, null)).toBeNull();
  });

  it('reads the saved summary whether it is an object or JSON text', () => {
    const r = { closedCashUsd: 70, closedCashKhr: 4000 };
    expect(receiptOf(shift({ receipt: r as never }))?.closedCashUsd).toBe(70);
    expect(receiptOf(shift({ receipt: JSON.stringify(r) }))?.closedCashUsd).toBe(70);
    expect(receiptOf(shift({ receipt: 'not json' }))).toBeNull();
    expect(receiptOf(null)).toBeNull();
  });

  it('works out expected cash and the difference', () => {
    expect(expectedCash(shift({ receipt: { closedCashUsd: 70, closedCashKhr: 9000 } as never }))).toEqual({ usd: 70, khr: 9000 });
    expect(expectedCash(shift({}))).toEqual({ usd: 10, khr: 4000 });
    expect(cashDifference({ usd: 69.5, khr: 9100 }, { usd: 70, khr: 9000 })).toEqual({ usd: -0.5, khr: 100 });
  });
});

describe('checkout', () => {
  it('pays a table once the order has been added and served offline, after opening the shift', async () => {
    const { server, engine } = setup();
    await queue(engine, openCmd(), addDish('L1'), newCmd('sendToKitchen', {}), newCmd('serveAll', {}), checkoutCmd());
    await engine.flush();
    expect(engine.getState().failed).toBe(0);
    expect(server.shifts).toHaveLength(1);
    expect(server.checkouts).toEqual([{ orderId: 'order-t1', slotId: 'slot', payments: 1 }]);
    expect(server.tables.t1).toMatchObject({ order: null, status: 'cleaning' });
  });

  it('does not pay twice when the answer to paying was lost', async () => {
    const { server, engine } = setup();
    await queue(engine, addDish('L1'), newCmd('sendToKitchen', {}), newCmd('serveAll', {}), checkoutCmd());
    const original = server.api.checkout;
    let drop = true;
    server.api.checkout = async (id, input) => {
      await original(id, input); // kh-pos took the payment...
      if (drop) {
        drop = false;
        throw new ApiError('network'); // ...but the phone never heard
      }
    };
    await engine.flush();
    expect(engine.getState().pending).toBe(1);
    await engine.flush(); // the order is already paid: done, not an "already checked out" failure
    expect(engine.getState().failed).toBe(0);
    expect(engine.getState().pending).toBe(0);
    expect(server.checkouts).toHaveLength(1);
  });

  it('checking out a table that is already paid by someone else is done, not failed', async () => {
    const { engine, server } = setup();
    await queue(engine, checkoutCmd());
    await engine.flush();
    expect(engine.getState().failed).toBe(0);
    expect(server.checkouts).toHaveLength(0);
  });

  it('shows a paid table as free to clean while the payment is waiting', () => {
    const table = { id: 't1', table_name: 'A-01', setting_capacity: 4, section: null, status: 'order_taken' as const, order: { orderId: 'o1', invoiceNo: 7, totalAmount: '2', items: [] } };
    const t = applyOutbox(table, [asCmd(checkoutCmd())]);
    expect(t).toMatchObject({ order: null, status: 'cleaning', pendingSync: 1 });
  });
});
