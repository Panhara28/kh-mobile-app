import { ApiError, KhPosApi, type FetchFn } from './client';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(respond: (call: Call) => { status?: number; json?: unknown; raw?: string } | Error) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const r = respond(call);
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (r.raw !== undefined ? JSON.parse(r.raw) : r.json),
    } as Response;
  }) as unknown as FetchFn;
  return { fn, calls };
}

const api = (fn: FetchFn, token: string | null = 'tok') => new KhPosApi('https://shop.example', async () => token, fn);

describe('KhPosApi requests', () => {
  it('sends Content-Type only with a body (kh-pos breaks on JSON GETs without one)', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true, result: [] } }));
    await api(fn).settings('wh1');
    await api(fn).markTableTaken('t1');
    expect(calls[0]!.headers['Content-Type']).toBeUndefined();
    expect(calls[0]!.headers.Authorization).toBe('Bearer tok');
    expect(calls[1]!.headers['Content-Type']).toBe('application/json');
    expect(calls[1]!.body).toEqual({ status: 'order_taken' });
  });

  it('does not send the token to public endpoints', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true, result: { data: [] } } }));
    await api(fn).categories('wh1');
    expect(calls[0]!.headers.Authorization).toBeUndefined();
    expect(calls[0]!.url).toBe('https://shop.example/api/category/menu?warehouse=wh1');
  });

  it('queries the menu with the same parameters as the web menu', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true, result: [] } }));
    await api(fn).menu({ warehouse: 'wh1', search: ' Coffee ', categoryKeys: 'cat1', limit: 20, offset: 40 });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/product-v2/menu');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'coffee', limit: '20', offset: '40', replenishment: 'false', compositeOnly: 'false',
      categoryKeys: 'cat1', warehouse: 'wh1', type: 'pos',
    });
  });

  it('creates an order for the table and never sends real prices', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true, result: 'order-1' } }));
    const id = await api(fn).createOrder({
      warehouseId: 'wh1', tableId: 't1', posInfo: { posSlotId: 's1', posCustomerId: 'c1' },
      lines: [{ id: 'l1', variantId: 'v1', qty: 2 }],
    });
    expect(id).toBe('order-1');
    expect(calls[0]!.body).toEqual({
      warehouseId: 'wh1', slotId: 's1', customerId: 'c1', invoiceNo: 0, tableNumber: 't1',
      items: [{ id: 'l1', variantId: 'v1', qty: 2, price: '0' }],
    });
  });

  it('removes a line with DELETE and an item_id body', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true } }));
    await api(fn).removeLine('o1', 'l1');
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://shop.example/api/pos/order/o1/remove-item', body: { item_id: 'l1' } });
  });

  it('returns the walk-in token and sends no Authorization header', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { token: 'abc' } }));
    const token = await api(fn).walkInLogin({ tableId: 't1', deviceId: 'd1', lat: 1, lng: 2 });
    expect(token).toBe('abc');
    expect(calls[0]!.headers.Authorization).toBeUndefined();
  });
});

describe('KhPosApi errors', () => {
  const kindOf = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'no error';
    } catch (e) {
      return e instanceof ApiError ? `${e.kind}:${e.message}` : 'other';
    }
  };

  it('maps HTTP statuses to error kinds with the server message', async () => {
    const at = (status: number, error: string) => fakeFetch(() => ({ status, json: { success: false, error } })).fn;
    expect(await kindOf(api(at(401, 'Unauthorized')).table('t1'))).toBe('unauthorized:Unauthorized');
    expect(await kindOf(api(at(403, "This order doesn't belong to your table")).addLine('o1', { id: 'l', variantId: 'v', qty: 1 }))).toBe(
      "forbidden:This order doesn't belong to your table",
    );
    expect(await kindOf(api(at(409, 'no POS slot')).table('t1'))).toBe('conflict:no POS slot');
    expect(await kindOf(api(at(500, 'boom')).table('t1'))).toBe('server:boom');
  });

  it('treats success:false with HTTP 200 as an error', async () => {
    const { fn } = fakeFetch(() => ({ json: { success: false, error: 'Table already have an active order' } }));
    expect(await kindOf(api(fn).table('t1'))).toBe('server:Table already have an active order');
  });

  it('reports network failures and non-JSON answers', async () => {
    expect(await kindOf(api(fakeFetch(() => new TypeError('Network request failed')).fn).table('t1'))).toBe(
      'network:Network request failed',
    );
    expect(await kindOf(api(fakeFetch(() => ({ status: 502, raw: '<html>' })).fn).table('t1'))).toBe(
      'server:Unexpected response from server',
    );
  });

  it('me() fails as unauthorized when the server has no user for the token', async () => {
    const { fn } = fakeFetch(() => ({ status: 401, json: { success: false, error: 'Unauthorized' } }));
    expect(await kindOf(api(fn).me())).toBe('unauthorized:Unauthorized');
  });
});
