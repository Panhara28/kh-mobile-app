import { SyncEngine, UNCONFIRMED } from './engine';
import { FakeServer } from './fake-server';
import { MemoryStore } from './memory-store';
import { hasPending, isUnsent, overlayRecords, waitingCount, recordCommand, recordCommands, type RecordRequest } from './records';
import type { OutboxCommand } from './types';

const USER = 'u1';
interface Cat {
  id: string;
  title: string;
}

function setup() {
  const server = new FakeServer();
  const store = new MemoryStore();
  const engine = new SyncEngine(server.api, store);
  engine.setUser(USER);
  return { server, store, engine };
}

let n = 0;
const req = (over: Partial<RecordRequest> = {}): RecordRequest => ({
  entity: 'category',
  op: 'update',
  recordId: 'c1',
  method: 'PUT',
  path: '/api/category',
  body: { id: 'c1', title: 'New' },
  label: 'New',
  row: { id: 'c1', title: 'New' },
  ...over,
});
const cmd = (r: RecordRequest, status: 'pending' | 'failed' = 'pending'): OutboxCommand =>
  ({ ...recordCommand(USER, r, `r${++n}`, 1), seq: n, attempts: 0, status }) as OutboxCommand;

describe('record commands in the engine', () => {
  it('is sent straight away when kh-pos is reachable', async () => {
    const { server, engine } = setup();
    const result = await engine.run(recordCommand(USER, req(), 'a'), async () => void (await server.api.call('PUT', '/api/category', { id: 'c1' })));
    expect(result).toBe('done');
    expect(server.requests).toEqual([{ method: 'PUT', path: '/api/category', body: { id: 'c1' } }]);
    expect(engine.getState().pending).toBe(0);
  });

  it('waits while kh-pos is unreachable and is sent, as it was, when it is back', async () => {
    const { server, engine } = setup();
    server.online = false;
    const result = await engine.run(recordCommand(USER, req({ body: { id: 'c1', title: 'Offline name' } }), 'a'), async () => void (await server.api.call('PUT', '/api/category', {})));
    expect(result).toBe('queued');
    expect(engine.getState().pending).toBe(1);
    expect(server.requests).toEqual([]);

    server.online = true;
    await engine.tick();
    expect(engine.getState().pending).toBe(0);
    expect(server.requests).toEqual([{ method: 'PUT', path: '/api/category', body: { id: 'c1', title: 'Offline name' } }]);
  });

  it('keeps the order of the changes', async () => {
    const { server, engine } = setup();
    engine.setOnline(false);
    await engine.enqueue(recordCommand(USER, req({ op: 'create', method: 'POST', recordId: 'c2', body: { id: 'c2' } }), 'a'));
    await engine.enqueue(recordCommand(USER, req({ op: 'delete', method: 'DELETE', recordId: 'c1', body: { id: 'c1' } }), 'b'));
    engine.setOnline(true);
    await engine.flush();
    expect(server.requests.map((r) => r.method)).toEqual(['POST', 'DELETE']);
  });

  it('marks a change kh-pos refuses as failed and carries on with the next', async () => {
    const { server, engine } = setup();
    engine.setOnline(false);
    await engine.enqueue(recordCommand(USER, req({ body: { id: 'c1' } }), 'a'));
    await engine.enqueue(recordCommand(USER, req({ recordId: 'c3', body: { id: 'c3' } }), 'b'));
    server.refuseRequestWith = 'Category is in use';
    engine.setOnline(true);
    await engine.flush();
    const state = engine.getState();
    expect(state.failed).toBe(1);
    expect(state.commands.find((c) => c.status === 'failed')?.error).toBe('Category is in use');
    expect(server.requests).toEqual([{ method: 'PUT', path: '/api/category', body: { id: 'c3' } }]);
  });

  it('counts an add that already got through (answer lost) as done', async () => {
    const { server, engine } = setup();
    engine.setOnline(false);
    await engine.enqueue(recordCommand(USER, req({ op: 'create', method: 'POST', recordId: 'c9', body: { id: 'c9' } }), 'a'));
    server.refuseRequestWith = 'Duplicate entry for key PRIMARY';
    engine.setOnline(true);
    await engine.flush();
    expect(engine.getState().failed).toBe(0);
    expect(engine.getState().pending).toBe(0);
  });
});

describe('showing waiting changes on a list', () => {
  const rows: Cat[] = [
    { id: 'c1', title: 'Drinks' },
    { id: 'c2', title: 'Food' },
  ];
  const idOf = (r: Cat) => r.id;

  it('shows an edit, an add and a delete before they are sent', () => {
    const commands = [
      cmd(req({ op: 'update', recordId: 'c1', row: { title: 'Cold drinks' } })),
      cmd(req({ op: 'create', method: 'POST', recordId: 'c3', row: { id: 'c3', title: 'Dessert' } })),
      cmd(req({ op: 'delete', method: 'DELETE', recordId: 'c2' })),
    ];
    const out = overlayRecords(rows, commands, 'category', idOf);
    expect(out).toEqual([
      { id: 'c1', title: 'Cold drinks', pendingSync: true, syncFailed: false },
      { id: 'c3', title: 'Dessert', pendingSync: true, syncFailed: false },
    ]);
    expect(rows).toHaveLength(2); // the loaded list is left alone
  });

  it('keeps failed changes visible, marked failed, and ignores other lists', () => {
    const commands = [cmd(req({ op: 'update', recordId: 'c1', row: { title: 'X' } }), 'failed'), cmd(req({ entity: 'supplier', recordId: 'c2', row: { title: 'Other' } }))];
    const out = overlayRecords(rows, commands, 'category', idOf);
    expect(out[0]).toMatchObject({ title: 'X', pendingSync: true, syncFailed: true });
    expect(out[1]).toEqual({ id: 'c2', title: 'Food' });
    expect(recordCommands(commands, 'supplier')).toHaveLength(1);
  });

  it('does not add a record twice, and knows which ones are only waiting to be added', () => {
    const create = cmd(req({ op: 'create', method: 'POST', recordId: 'c3', row: { id: 'c3', title: 'Dessert' } }));
    const withIt = overlayRecords([...rows, { id: 'c3', title: 'Dessert' }], [create], 'category', idOf);
    expect(withIt.filter((r) => r.id === 'c3')).toHaveLength(1);
    const shown = overlayRecords(rows, [create], 'category', idOf).find((r) => r.id === 'c3')!;
    expect(isUnsent(shown, [create], 'category', 'c3')).toBe(true);
    expect(isUnsent({ pendingSync: true }, [cmd(req({ recordId: 'c1' }))], 'category', 'c1')).toBe(false);
    expect(isUnsent({}, [create], 'category', 'c3')).toBe(false);
  });
});

describe('actions on a record', () => {
  const idOf = (r: { id: string }) => r.id;
  it('shows an action that has a row like an edit, and ignores one without', () => {
    const rows = [{ id: 'p1', status: 'pending' }];
    const withRow = cmd(req({ entity: 'po', op: 'action', recordId: 'p1', row: { status: 'approved' } }));
    const without = cmd(req({ entity: 'po', op: 'action', recordId: 'p1', row: undefined }));
    expect(overlayRecords(rows, [withRow], 'po', idOf)[0]).toMatchObject({ status: 'approved', pendingSync: true });
    expect(overlayRecords(rows, [without], 'po', idOf)).toEqual([{ id: 'p1', status: 'pending' }]);
  });
  it('does not add a row for an add that has no row to show', () => {
    expect(overlayRecords([{ id: 'p1' }], [cmd(req({ entity: 'po', op: 'create', recordId: 'p2', row: undefined }))], 'po', idOf)).toEqual([{ id: 'p1' }]);
  });
  it('knows when a change to a record is waiting, and counts the waiting ones', () => {
    const waiting = cmd(req({ entity: 'po', op: 'action', recordId: 'p1' }));
    const failed = cmd(req({ entity: 'po', op: 'action', recordId: 'p2' }), 'failed');
    expect(hasPending([waiting, failed], 'po', 'p1')).toBe(true);
    expect(hasPending([waiting, failed], 'po', 'p2')).toBe(false);
    expect(hasPending([waiting], 'other', 'p1')).toBe(false);
    expect(waitingCount([waiting, failed], ['po'])).toBe(2);
    expect(waitingCount([waiting], ['x'])).toBe(0);
  });
});

describe('changes that must not be done twice', () => {
  const stockIn = (id = 'a') => recordCommand(USER, req({ entity: 'stock', op: 'action', method: 'POST', path: '/api/inventory/stock-in', recordId: 'v1:s1', body: { qty: 5 }, label: 'Stock in', once: true, row: undefined }), id);

  it('is sent at once when kh-pos answers', async () => {
    const { server, engine } = setup();
    const result = await engine.runOnce(stockIn(), async () => void (await server.api.call('POST', '/api/inventory/stock-in', { qty: 5 })));
    expect(result).toBe('done');
    expect(server.requests).toHaveLength(1);
  });

  it('waits when kh-pos is unreachable, then is sent once', async () => {
    const { server, engine } = setup();
    server.online = false;
    const result = await engine.runOnce(stockIn(), async () => void (await server.api.call('POST', '/x', {})));
    expect(result).toBe('queued');
    expect(engine.getState().pending).toBe(1);
    server.online = true;
    await engine.tick();
    expect(server.requests.filter((r) => r.path === '/api/inventory/stock-in')).toHaveLength(1);
  });

  it('does not queue or repeat it when the answer to the send is lost', async () => {
    const { server, engine } = setup();
    server.dropAnswerOnce = true;
    await expect(engine.runOnce(stockIn(), async () => void (await server.api.call('POST', '/api/inventory/stock-in', { qty: 5 })))).rejects.toThrow(UNCONFIRMED);
    expect(engine.getState().pending).toBe(0);
    expect(server.requests).toHaveLength(1); // it reached kh-pos once and is not sent again
  });

  it('keeps a queued one as failed (not confirmed) instead of sending it again when the answer is lost on replay', async () => {
    const { server, engine } = setup();
    engine.setOnline(false);
    await engine.enqueue(stockIn());
    server.dropAnswerOnce = true;
    engine.setOnline(true);
    await engine.flush();
    const state = engine.getState();
    expect(state.failed).toBe(1);
    expect(state.commands[0]?.error).toBe(UNCONFIRMED);
    expect(server.requests).toHaveLength(1);
  });

  it('shows a kh-pos refusal of a once change to the caller', async () => {
    const { server, engine } = setup();
    server.refuseRequestWith = 'Not enough stock';
    await expect(engine.runOnce(stockIn(), async () => void (await server.api.call('POST', '/api/inventory/stock-out', {})))).rejects.toThrow('Not enough stock');
  });
});
