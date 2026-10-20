import { isPrintUrl, productLotTestJob, receiptJob, sendJob, testConnection, ticketTestJob, UNAUTHORIZED_CODE, type SocketLike } from './print-server';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}
const make = () => {
  const sockets: FakeSocket[] = [];
  return { sockets, factory: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  } };
};

describe('jobs', () => {
  it('wraps a receipt as html for a named printer, sized under the printable width', () => {
    const job = JSON.parse(receiptJob('<p>Hi</p>', 'XP-80C', '80mm'));
    expect(job.printer_info).toEqual({ printer_name: 'XP-80C', type: 'data:text/html', page_size: '80mm' });
    expect(job.content).toHaveLength(1);
    expect(job.content[0]).toContain('<p>Hi</p>');
    expect(job.content[0]).toContain('width:70mm');
    expect(JSON.parse(receiptJob('x', 'P', '58mm')).content[0]).toContain('width:46mm');
    expect(JSON.parse(receiptJob('x', 'P', '100mm')).content[0]).not.toContain('max-width');
  });
  it('builds the two test jobs like the web', () => {
    const lot = JSON.parse(productLotTestJob('Cashier'));
    expect(lot.printer_info).toEqual({ printer_name: 'Cashier', type: 'product_lot', size: 'big' });
    expect(lot.content[0].lotNumber).toBe('LOT-2025-0042');
    const printer = { id: '1', name: 'Cashier Printer', printer_name: 'XP-80C', ip: '127.0.0.1', port: 9100 };
    const ticket = JSON.parse(ticketTestJob(printer, { date: 'Tue, 21 Oct 2026', time: '10:00 am' }));
    expect(ticket.printer_info).toEqual(printer);
    expect(ticket.content[0]).toHaveLength(9);
    expect(ticket.content[0][7]).toMatchObject({ type: 'qrCode', value: 'ASs234as' });
  });
  it('accepts only ws:// and wss:// addresses', () => {
    expect(isPrintUrl('ws://192.168.1.20:8181')).toBe(true);
    expect(isPrintUrl('wss://printer.example.com/?token=SHOP-1')).toBe(true);
    expect(isPrintUrl('http://192.168.1.20')).toBe(false);
    expect(isPrintUrl('')).toBe(false);
  });
});

describe('testConnection', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is connected when the bridge says welcome', async () => {
    const { sockets, factory } = make();
    const p = testConnection('ws://x', factory);
    sockets[0]!.onopen!();
    sockets[0]!.onmessage!({ data: JSON.stringify({ type: 'welcome', message: 'Hello bridge' }) });
    await expect(p).resolves.toEqual({ ok: true, message: 'Hello bridge' });
    expect(sockets[0]!.closed).toBe(true);
  });
  it('is connected when the socket is open and says nothing', async () => {
    const { sockets, factory } = make();
    const p = testConnection('ws://x', factory);
    sockets[0]!.onopen!();
    jest.advanceTimersByTime(1500);
    await expect(p).resolves.toMatchObject({ ok: true });
  });
  it('reports a refused token, an error message, an unreachable address and a timeout', async () => {
    let m = make();
    let p = testConnection('ws://x', m.factory);
    m.sockets[0]!.onclose!({ code: UNAUTHORIZED_CODE });
    await expect(p).resolves.toMatchObject({ ok: false, unauthorized: true });

    m = make();
    p = testConnection('ws://x', m.factory);
    m.sockets[0]!.onmessage!({ data: JSON.stringify({ type: 'error', message: 'Nope' }) });
    await expect(p).resolves.toEqual({ ok: false, message: 'Nope' });

    m = make();
    p = testConnection('ws://x', m.factory);
    m.sockets[0]!.onerror!();
    await expect(p).resolves.toMatchObject({ ok: false, message: expect.stringContaining('Could not reach') });

    m = make();
    p = testConnection('ws://x', m.factory, 1000);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toMatchObject({ ok: false, message: expect.stringContaining('timed out') });
  });
  it('reports a factory that throws', async () => {
    await expect(testConnection('nope', () => { throw new Error('bad url'); })).resolves.toEqual({ ok: false, message: 'bad url' });
  });
});

describe('sendJob', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends the text once the socket is open and closes', async () => {
    const { sockets, factory } = make();
    const p = sendJob('ws://x', '{"job":1}', factory);
    sockets[0]!.onopen!();
    jest.advanceTimersByTime(400);
    await expect(p).resolves.toEqual({ ok: true, message: 'Sent to the print server' });
    expect(sockets[0]!.sent).toEqual(['{"job":1}']);
    expect(sockets[0]!.closed).toBe(true);
  });
  it('fails when the bridge refuses the token right after, or cannot be reached', async () => {
    let m = make();
    let p = sendJob('ws://x', 'j', m.factory);
    m.sockets[0]!.onopen!();
    m.sockets[0]!.onclose!({ code: UNAUTHORIZED_CODE });
    await expect(p).resolves.toMatchObject({ ok: false, unauthorized: true });

    m = make();
    p = sendJob('ws://x', 'j', m.factory);
    m.sockets[0]!.onerror!();
    await expect(p).resolves.toMatchObject({ ok: false });
    expect(m.sockets[0]!.sent).toEqual([]);
  });
});
