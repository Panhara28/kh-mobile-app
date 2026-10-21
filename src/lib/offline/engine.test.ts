import { ApiError } from '../api';
import { createSecretBox } from './secret';
import { SyncEngine } from './engine';
import { dish, FakeServer } from './fake-server';
import { MemoryStore } from './memory-store';
import { applyOutbox } from './overlay';
import type { AddLinePayload, NewCommand } from './types';

const USER = 'u1';

function setup(tableIds?: string[]) {
  const server = new FakeServer(tableIds);
  const store = new MemoryStore();
  const engine = new SyncEngine(server.api, store);
  engine.setUser(USER);
  return { server, store, engine, setUser: (u: string | null) => engine.setUser(u) };
}

/** Puts changes in the outbox without any background sync starting (the engine is marked offline). */
async function queue(engine: SyncEngine, ...cmds: NewCommand[]) {
  engine.setOnline(false);
  for (const c of cmds) await engine.enqueue(c);
}

let n = 0;
const add = (lineId: string, variant: string, qty = 1, extra: Partial<AddLinePayload> = {}, tableId = 't1', userId = USER): NewCommand => ({
  id: `c${++n}`,
  userId,
  kind: 'addLine',
  tableId,
  createdAt: 1_760_000_000_000 + n,
  payload: { lineId, product: dish(variant), qty, options: [], note: '', warehouseId: 'w1', capEnabled: false, ...extra } satisfies AddLinePayload,
});
const setPending = (orderDetailId: string, qty: number, base?: number): NewCommand => ({ id: `c${++n}`, userId: USER, kind: 'setPending', tableId: 't1', createdAt: 1, payload: { orderDetailId, qty, base } });
const send = (): NewCommand => ({ id: `c${++n}`, userId: USER, kind: 'sendToKitchen', tableId: 't1', createdAt: 1, payload: {} });
const remove = (orderDetailId: string): NewCommand => ({ id: `c${++n}`, userId: USER, kind: 'removeLine', tableId: 't1', createdAt: 1, payload: { orderDetailId } });
const seedOrder = (server: FakeServer) =>
  server.api.createOrder({ warehouseId: 'w1', tableId: 't1', posInfo: { posSlotId: 's', posCustomerId: 'c' }, invoiceNo: 1, line: { id: 'S1', variantId: 'v1', qty: 1, price: 2 } });

describe('SyncEngine', () => {
  it('queues a change while kh-pos is unreachable, then replays it when it is back', async () => {
    const { server, engine } = setup();
    server.online = false;
    const result = await engine.run(add('L1', 'v1', 2), async () => void (await server.api.table('t1')));
    expect(result).toBe('queued');
    expect(engine.getState().pending).toBe(1);
    expect(engine.getState().online).toBe(false);
    expect(server.tables.t1!.order).toBeNull();

    server.online = true;
    await engine.tick();
    expect(server.summary()).toEqual(['v1×2(2/0)']);
    expect(server.tables.t1!.status).toBe('order_taken');
    expect(engine.getState().pending).toBe(0);
    expect(engine.getState().online).toBe(true);
    expect(engine.getState().syncVersion).toBe(1);
    expect(engine.getState().lastSyncedAt).not.toBeNull();
  });

  it('does the change online when kh-pos is reachable and nothing is waiting', async () => {
    const { engine } = setup();
    let called = 0;
    const result = await engine.run(add('L1', 'v1'), async () => void called++);
    expect(result).toBe('done');
    expect(called).toBe(1);
    expect(engine.getState().pending).toBe(0);
  });

  it('falls back to the outbox when the online call fails because of the network', async () => {
    const { engine } = setup();
    const result = await engine.run(add('L1', 'v1'), async () => {
      throw new ApiError('network');
    });
    expect(result).toBe('queued');
    expect(engine.getState().online).toBe(false);
    expect(engine.getState().pending).toBe(1);
  });

  it("lets kh-pos' own refusals through to the caller, without queueing", async () => {
    const { engine } = setup();
    await expect(
      engine.run(add('L1', 'v1'), async () => {
        throw new ApiError('server', 400, 'nope');
      }),
    ).rejects.toThrow('nope');
    expect(engine.getState().pending).toBe(0);
  });

  it('keeps order: while something is waiting, new changes are queued, not done out of turn', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1'));
    let called = 0;
    const r = await engine.run(add('L2', 'v2'), async () => void called++);
    expect(r).toBe('queued');
    expect(called).toBe(0);
    await engine.flush();
    expect(server.summary()).toEqual(['v1×1(1/0)', 'v2×1(1/0)']);
  });

  it('replays several changes in order: add, add the same dish again, change quantity, send', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1', 1), add('L2', 'v1', 1), add('L3', 'v2', 1), setPending('L2', 3), send());
    // L2 is the same plain dish as L1, so it merged into L1 on kh-pos: the quantity change for L2 must reach L1
    await engine.flush();
    expect(server.summary()).toEqual(['v1×3(0/3)', 'v2×1(0/1)']);
    expect(engine.getState().pending).toBe(0);
    expect(engine.getState().failed).toBe(0);
  });

  it('does not open the order twice when the answer to creating it was lost', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1', 1));
    const original = server.api.createOrder;
    let drop = true;
    server.api.createOrder = async (input) => {
      const id = await original(input); // kh-pos opened the order...
      if (drop) {
        drop = false;
        throw new ApiError('network'); // ...but the phone never heard
      }
      return id;
    };
    await engine.flush();
    expect(engine.getState().pending).toBe(1); // kept for the next attempt
    expect(server.summary()).toEqual(['v1×1(1/0)']);
    await engine.flush();
    expect(server.summary()).toEqual(['v1×1(1/0)']);
    expect(engine.getState().pending).toBe(0);
  });

  it('adds the options and note that a dropped connection left out', async () => {
    const { server, engine } = setup();
    const egg = { id: 'm1', modifierId: 'g', name: 'Egg', price: 0.5 };
    await queue(engine, add('L1', 'v1', 1, { options: [egg], note: 'no chili' }));
    const original = server.api.addModifier;
    let drop = true;
    server.api.addModifier = async (...a) => {
      if (drop) {
        drop = false;
        throw new ApiError('network'); // the line exists, its options don't yet
      }
      return original(...a);
    };
    await engine.flush();
    expect(engine.getState().pending).toBe(1);
    expect(server.tables.t1!.order!.items![0]!.orderModifiers).toHaveLength(0);
    await engine.flush();
    expect(server.tables.t1!.order!.items![0]!.orderModifiers!.map((m) => m.modifierItemId).sort()).toEqual(['m1', 'notes']);
    expect(engine.getState().pending).toBe(0);
  });

  it('does not raise a merged quantity twice when the answer was lost', async () => {
    const { server, engine } = setup();
    await seedOrder(server); // 1 pending portion of v1 on kh-pos
    await queue(engine, add('L1', 'v1', 2));
    server.dropAnswerOnce = true; // the quantity is raised to 3, then the answer is lost
    await engine.flush();
    expect(engine.getState().pending).toBe(1);
    expect(server.summary()).toEqual(['v1×3(3/0)']);
    await engine.flush();
    expect(server.summary()).toEqual(['v1×3(3/0)']); // not 5
    expect(engine.getState().pending).toBe(0);
  });

  it('marks a command failed when kh-pos refuses it, and carries on with the rest', async () => {
    const { server, engine } = setup(['t1', 't2']);
    await queue(engine, add('L1', 'v1', 1, {}, 't1'), add('L2', 'v2', 1, {}, 't2'));
    const original = server.api.createOrder;
    server.api.createOrder = async (input) => {
      if (input.tableId === 't1') throw new ApiError('server', 400, 'Table is taken');
      return original(input);
    };
    await engine.flush();
    const state = engine.getState();
    expect(state.failed).toBe(1);
    expect(state.commands.find((c) => c.status === 'failed')!.error).toBe('Table is taken');
    expect(server.tables.t2!.order!.items).toHaveLength(1);

    // a failed command is not shown on screen; it can be retried
    expect(applyOutbox(server.tables.t1!, state.commands).order).toBeNull();
    server.api.createOrder = original;
    await engine.retryAll();
    await engine.flush();
    expect(engine.getState().failed).toBe(0);
    expect(server.tables.t1!.order!.items).toHaveLength(1);
  });

  it('can discard a failed command', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1'));
    server.rejectWith = new ApiError('server', 400, 'no');
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    await engine.discard(engine.getState().commands[0]!.id);
    expect(engine.getState().commands).toHaveLength(0);
  });

  it('keeps everything when the login has expired', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1'));
    server.api.table = async () => {
      throw new ApiError('unauthorized', 401);
    };
    await engine.flush();
    expect(engine.getState().pending).toBe(1);
    expect(engine.getState().failed).toBe(0);
  });

  it("only replays the signed-in staff member's changes", async () => {
    const { server, engine, setUser } = setup();
    await queue(engine, add('L1', 'v1', 1, {}, 't1', 'someone-else'));
    expect(engine.getState().pending).toBe(0); // not this user's
    await engine.flush();
    expect(server.summary()).toEqual([]);
    setUser('someone-else');
    await engine.refresh();
    expect(engine.getState().pending).toBe(1);
    await engine.flush();
    expect(server.summary()).toEqual(['v1×1(1/0)']);
  });

  it('removing a line that is already gone is fine', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1'));
    await engine.flush();
    await queue(engine, remove('L1'), remove('ghost'));
    await engine.flush();
    expect(server.summary()).toEqual([]);
    expect(engine.getState().failed).toBe(0);
  });

  it('sending to the kitchen twice does not fail the second time', async () => {
    const { server, engine } = setup();
    await queue(engine, add('L1', 'v1'), send(), send());
    await engine.flush();
    expect(server.summary()).toEqual(['v1×1(0/1)']);
    expect(engine.getState().failed).toBe(0);
  });

  it('sets a pending quantity on a line that exists on kh-pos', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, setPending('S1', 4));
    await engine.flush();
    expect(server.summary()).toEqual(['v1×4(4/0)']);
  });

  it('fails a quantity change for a line that is gone, without blocking the next change', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, setPending('ghost', 2), add('L2', 'v2'));
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    expect(server.summary()).toEqual(['v1×1(1/0)', 'v2×1(1/0)']);
  });

  it('keeps what someone else changed meanwhile: the phone sends its difference, not its number', async () => {
    const { server, engine } = setup();
    await seedOrder(server); // S1 has 1 pending
    await queue(engine, setPending('S1', 3, 1)); // the phone saw 1 and raised it by 2
    await server.api.setPendingQty((await server.api.table('t1')).order!.orderId, 'S1', 5); // another device made it 5
    await engine.flush();
    expect(server.summary()).toEqual(['v1×7(7/0)']);
  });

  it('applies the difference only once when the answer to the change is lost', async () => {
    const { server, engine } = setup();
    await seedOrder(server);
    await queue(engine, setPending('S1', 3, 1));
    server.dropAnswerOnce = true;
    await engine.flush();
    await engine.flush();
    expect(server.summary()).toEqual(['v1×3(3/0)']);
    expect(engine.getState().pending).toBe(0);
  });
});

describe('Retail sale offline', () => {
  const cartLine = { lineId: 'R1', variantId: 'v9', productId: 'p9', name: 'Soap', price: 3, barcode: '123', qty: 2 };
  const sale = (orderId = 'order-r1'): NewCommand => ({
    id: `c${++n}`,
    userId: USER,
    kind: 'retailSale',
    tableId: '',
    createdAt: 1,
    payload: { orderId, warehouseId: 'w1', cart: [cartLine], payments: [], receipt: {} as never },
  });

  it('opens and pays the sale when kh-pos is back', async () => {
    const { server, engine } = setup();
    await queue(engine, sale());
    await engine.flush();
    expect(server.retailOrders['order-r1']).toMatchObject({ status: 'COMPLETED', items: 1 });
    expect(server.checkouts).toHaveLength(1);
    expect(engine.getState().pending).toBe(0);
  });

  it('does not sell twice when the answer to the payment is lost', async () => {
    const { server, engine } = setup();
    await queue(engine, sale());
    server.dropAnswerOnce = true; // lost after createRetailOrder
    await engine.flush();
    server.dropAnswerOnce = true; // lost after checkout
    await engine.flush();
    await engine.flush();
    expect(Object.keys(server.retailOrders)).toEqual(['order-r1']);
    expect(server.checkouts).toHaveLength(1);
    expect(engine.getState().pending).toBe(0);
    expect(engine.getState().failed).toBe(0);
  });

  it('keeps the sale as failed, with the reason, when the stock is not in the POS slot', async () => {
    const { server, engine } = setup();
    server.stockShort = true;
    await queue(engine, sale());
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    expect(Object.keys(server.retailOrders)).toEqual([]);
    server.stockShort = false;
    await engine.retry(engine.getState().commands[0]!.id);
    await engine.flush();
    expect(server.retailOrders['order-r1']!.status).toBe('COMPLETED');
  });
});

describe('Table transfer offline', () => {
  const transfer = (to = 't2', orderId = 'order-t1'): NewCommand => ({
    id: `c${++n}`,
    userId: USER,
    kind: 'transfer',
    tableId: 't1',
    createdAt: 1,
    payload: { orderId, destinationTableId: to, destinationName: to.toUpperCase(), transferDiscount: true, order: { orderId, invoiceNo: 1, totalAmount: '2', items: [] } },
  });

  it('moves the whole order to the free table when kh-pos is back, and the overlay shows it there at once', async () => {
    const { server, engine } = setup(['t1', 't2']);
    await seedOrder(server);
    await queue(engine, transfer());
    const shown = engine.getState().commands.map((c) => c);
    const t2 = applyOutbox(server.tables.t2!, shown);
    expect(t2.order?.orderId).toBe('order-t1');
    expect(applyOutbox(server.tables.t1!, shown).order).toBeNull();
    await engine.flush();
    expect(server.transfers).toEqual(['t2']);
    expect(server.tables.t2!.order?.orderId).toBe('order-t1');
    expect(engine.getState().pending).toBe(0);
  });

  it('is done when the order is already on the destination (the answer was lost)', async () => {
    const { server, engine } = setup(['t1', 't2']);
    await seedOrder(server);
    await queue(engine, transfer());
    server.dropAnswerOnce = true;
    await engine.flush();
    await engine.flush();
    expect(server.transfers).toEqual(['t2']);
    expect(engine.getState().failed).toBe(0);
    expect(engine.getState().pending).toBe(0);
  });

  it('refuses to merge when somebody took the destination meanwhile', async () => {
    const { server, engine } = setup(['t1', 't2']);
    await seedOrder(server);
    await server.api.createOrder({ warehouseId: 'w1', tableId: 't2', posInfo: { posSlotId: 's', posCustomerId: 'c' }, invoiceNo: 2, line: { id: 'X1', variantId: 'v2', qty: 1, price: 2 } });
    await queue(engine, transfer());
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    expect(engine.getState().commands[0]!.error).toMatch(/has an order now/);
    expect(server.transfers).toEqual([]);
  });
});

describe('Write-ahead: every change is in the database before it is sent', () => {
  const rec = (id: string, over: Record<string, unknown> = {}): NewCommand => ({
    id,
    userId: USER,
    kind: 'record',
    tableId: 'record:x',
    createdAt: 1,
    payload: { entity: 'x', op: 'update', recordId: 'r1', method: 'PUT', path: '/api/x', label: 'X', ...over },
  });

  it('keeps the change in the database while it is being sent, and removes it once kh-pos accepted it', async () => {
    const { store, engine } = setup();
    let seen: string[] = [];
    const how = await engine.run(rec('w1'), async () => {
      seen = (await store.outboxList()).map((c) => `${c.id}:${c.status}`);
    });
    expect(how).toBe('done');
    expect(seen).toEqual(['w1:sending']);
    expect(await store.outboxList()).toEqual([]);
    expect(engine.getState().commands).toEqual([]);
  });

  it('turns it into a waiting change when the signal is lost mid-send, and sends it later', async () => {
    const { server, store, engine } = setup();
    const how = await engine.run(rec('w2'), async () => {
      throw new ApiError('network', undefined, 'gone');
    });
    expect(how).toBe('queued');
    expect((await store.outboxList()).map((c) => c.status)).toEqual(['pending']);
    expect(engine.getState().pending).toBe(1);
    await engine.tick();
    expect(server.requests).toHaveLength(1);
    expect(await store.outboxList()).toEqual([]);
  });

  it('does not keep a change kh-pos refused: the error goes to the caller', async () => {
    const { store, engine } = setup();
    await expect(engine.run(rec('w3'), async () => { throw new ApiError('server', 400, 'No'); })).rejects.toThrow('No');
    expect(await store.outboxList()).toEqual([]);
  });

  it('keeps a send-once change as "not confirmed" when the answer is lost, instead of dropping it', async () => {
    const { store, engine } = setup();
    await expect(engine.runOnce(rec('w4', { once: true }), async () => { throw new ApiError('network', undefined, 'gone'); })).rejects.toThrow(/Check there/);
    const [c] = await store.outboxList();
    expect(c).toMatchObject({ id: 'w4', status: 'failed' });
    expect(c!.error).toMatch(/Could not confirm/);
  });

  it('after a crash: a change safe to repeat waits again, one that could be done twice is kept for the staff to check', async () => {
    const { store, engine } = setup();
    await store.outboxAdd({ ...rec('c-safe'), status: 'sending' });
    await store.outboxAdd({ ...rec('c-once', { op: 'action', once: true }), status: 'sending' });
    await store.outboxAdd({ ...rec('c-create', { op: 'create' }), status: 'sending' });
    await store.outboxAdd({ ...setPending('S1', 2), id: 'c-order', status: 'sending' });
    await engine.recoverSending();
    const by = Object.fromEntries((await store.outboxList()).map((c) => [c.id, c.status]));
    expect(by).toEqual({ 'c-safe': 'pending', 'c-once': 'failed', 'c-create': 'failed', 'c-order': 'pending' });
  });

  it('does not touch a change this run of the app is sending right now', async () => {
    const { store, engine } = setup();
    let during: string | undefined;
    await engine.run(rec('w5'), async () => {
      await engine.recoverSending();
      during = (await store.outboxList())[0]?.status;
    });
    expect(during).toBe('sending');
  });
});

describe('A queued change that carries a password', () => {
  const keyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const box = createSecretBox({ get: async () => keyBytes, set: async () => undefined }, (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));

  it('is stored sealed (no password in the SQLite file) and sent in the clear when kh-pos is back', async () => {
    const server = new FakeServer();
    const store = new MemoryStore();
    const engine = new SyncEngine(server.api, store, Date.now, box);
    engine.setUser(USER);
    const body = { userId: 'u9', newPassword: 'Sup3r-secret' };
    const sealed = await box.seal(JSON.stringify({ body, steps: undefined }));
    engine.setOnline(false);
    await engine.enqueue({
      id: 'p1',
      userId: USER,
      kind: 'record',
      tableId: 'record:user',
      createdAt: 1,
      payload: { entity: 'user', op: 'action', recordId: 'u9', method: 'POST', path: '/api/user/reset-password', sealed, label: 'Reset password', once: true },
    });
    expect(JSON.stringify(await store.outboxList())).not.toContain('Sup3r-secret');
    server.online = true;
    await engine.tick();
    expect(server.requests).toEqual([{ method: 'POST', path: '/api/user/reset-password', body }]);
    expect(await store.outboxList()).toEqual([]);
  });

  it('is kept as failed with a clear reason when the key is gone (secure storage reset)', async () => {
    const server = new FakeServer();
    const store = new MemoryStore();
    const other = createSecretBox({ get: async () => globalThis.crypto.getRandomValues(new Uint8Array(32)), set: async () => undefined }, (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
    const engine = new SyncEngine(server.api, store, Date.now, other);
    engine.setUser(USER);
    engine.setOnline(false);
    await engine.enqueue({
      id: 'p2',
      userId: USER,
      kind: 'record',
      tableId: 'record:user',
      createdAt: 1,
      payload: { entity: 'user', op: 'action', recordId: 'u9', method: 'POST', path: '/api/user/reset-password', sealed: await box.seal('{"body":{}}'), label: 'Reset password' },
    });
    server.online = true;
    await engine.tick();
    expect(server.requests).toEqual([]);
    expect(engine.getState().commands[0]).toMatchObject({ status: 'failed' });
    expect(engine.getState().commands[0]!.error).toMatch(/can no longer be read/);
  });
});

describe('A change with several calls', () => {
  it('uses the id answered by the first call in the second, and carries on from the second if it is interrupted', async () => {
    const { server, engine } = setup();
    server.answers['POST /api/replenishment'] = { result: 'REP-1' };
    await queue(engine, {
      id: 'm1',
      userId: USER,
      kind: 'record',
      tableId: 'record:replenishment',
      createdAt: 1,
      payload: {
        entity: 'replenishment',
        op: 'create',
        recordId: 'new:1',
        method: 'POST',
        path: '/api/replenishment',
        once: true,
        label: 'R',
        steps: [
          { method: 'POST', path: '/api/replenishment', body: { lines: 1 } },
          { method: 'PUT', path: '/api/replenishment/{{result}}/stock-picking-list', body: { id: '{{result}}' } },
        ],
      },
    });
    await engine.flush();
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/replenishment', 'PUT /api/replenishment/REP-1/stock-picking-list']);
    expect(server.requests[1]!.body).toEqual({ id: 'REP-1' });
    expect(engine.getState().commands).toEqual([]);
  });
});

describe('A queued change with a picture picked on the phone', () => {
  it('uploads the picture first, sends the change with its address, and does not upload it twice on a retry', async () => {
    const { server, engine } = setup();
    server.answers['POST /api/upload'] = { url: '/files/cat.jpg' };
    await queue(engine, {
      id: 'pic1',
      userId: USER,
      kind: 'record',
      tableId: 'record:category',
      createdAt: 1,
      payload: { entity: 'category', op: 'create', recordId: 'c1', method: 'POST', path: '/api/category', body: { title: 'Tea', imageUrl: 'data:image/jpeg;base64,QUJD' }, label: 'Tea' },
    });
    server.refuseRequestWith = null;
    await engine.flush();
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/upload', 'POST /api/category']);
    expect(server.requests[0]!.body).toMatchObject({ fileContent: 'QUJD' });
    expect(server.requests[1]!.body).toEqual({ title: 'Tea', imageUrl: '/files/cat.jpg' });
    expect(engine.getState().commands).toEqual([]);
  });

  it('remembers an upload when the change itself is refused, so Retry does not upload the picture again', async () => {
    const { server, engine } = setup();
    server.answers['POST /api/upload'] = { url: '/files/cat.jpg' };
    await queue(engine, {
      id: 'pic2',
      userId: USER,
      kind: 'record',
      tableId: 'record:category',
      createdAt: 1,
      payload: { entity: 'category', op: 'create', recordId: 'c2', method: 'POST', path: '/api/category', body: { title: 'Tea', imageUrl: 'data:image/jpeg;base64,QUJD' }, label: 'Tea' },
    });
    // the upload goes through, then kh-pos refuses the category
    const original = server.api.call;
    let first = true;
    server.api.call = (async (m: string, p: string, b?: unknown) => {
      if (p === '/api/category' && first) {
        first = false;
        throw new ApiError('server', 400, 'No');
      }
      return original(m, p, b);
    }) as typeof original;
    await engine.flush();
    expect(engine.getState().failed).toBe(1);
    await engine.retry('pic2');
    await engine.flush();
    expect(server.requests.filter((r) => r.path === '/api/upload')).toHaveLength(1);
    expect(engine.getState().commands).toEqual([]);
  });
});

describe('An idle app notices that kh-pos has gone', () => {
  it('asks kh-pos every 20 seconds while online with nothing waiting, and turns Offline when it does not answer', async () => {
    let clock = 1_000_000;
    const server = new FakeServer();
    const engine = new SyncEngine(server.api, new MemoryStore(), () => clock);
    engine.setUser(USER);
    await engine.tick(); // the first check
    expect(engine.getState().online).toBe(true);
    server.online = false;
    clock += 5_000;
    await engine.tick(); // too soon: no question asked
    expect(engine.getState().online).toBe(true);
    clock += 20_000;
    await engine.tick();
    expect(engine.getState().online).toBe(false);
    server.online = true;
    await engine.tick(); // offline: asked every time
    expect(engine.getState().online).toBe(true);
  });
});
