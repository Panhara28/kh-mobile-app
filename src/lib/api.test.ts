import { ApiError, KhPosApi, type FetchFn } from './api';

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

const api = (fn: FetchFn, token: string | null = null) => new KhPosApi('http://pos.local:3001', () => token, fn);

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ApiError ? e.kind : 'other';
  }
}

describe('login', () => {
  it('posts username and password as JSON and returns the token', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { token: 'tok' } }));
    expect(await api(fn).login('staff1', 'pw')).toBe('tok');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://pos.local:3001/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'staff1', password: 'pw' },
    });
  });

  it('treats kh-pos\'s HTTP 200 { error } answer as wrong credentials', async () => {
    const { fn } = fakeFetch(() => ({ json: { error: 'Invalid username or password' } }));
    expect(await kindOf(api(fn).login('staff1', 'bad'))).toBe('invalidCredentials');
  });

  it('reports network problems separately', async () => {
    const { fn } = fakeFetch(() => new TypeError('Network request failed'));
    expect(await kindOf(api(fn).login('a', 'b'))).toBe('network');
    expect(await kindOf(new KhPosApi('', () => null, fn).login('a', 'b'))).toBe('notConfigured');
  });
});

describe('authenticated requests', () => {
  it('sends the bearer token, and no Content-Type on GET', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { user: { id: 'u1', username: 'staff1' } } }));
    const user = await api(fn, 'tok').me();
    expect(user.username).toBe('staff1');
    expect(calls[0]!.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('maps 401/403/500 and success:false', async () => {
    expect(await kindOf(api(fakeFetch(() => ({ status: 401, json: { error: 'Unauthorized' } })).fn).me())).toBe('unauthorized');
    expect(await kindOf(api(fakeFetch(() => ({ status: 403, json: {} })).fn).me())).toBe('forbidden');
    expect(await kindOf(api(fakeFetch(() => ({ status: 500, json: {} })).fn).me())).toBe('server');
    expect(await kindOf(api(fakeFetch(() => ({ json: { success: false, error: 'x' } })).fn).settings('w'))).toBe('server');
    expect(await kindOf(api(fakeFetch(() => ({ status: 502, raw: '<html>' })).fn).me())).toBe('server');
  });

  it('queries the menu like the web menu', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true, result: [] } }));
    await api(fn, 'tok').menu({ warehouse: 'wh1', search: ' Rice ', categoryId: 'c1', limit: 20, offset: 40 });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/product-v2/menu');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'rice', limit: '20', offset: '40', replenishment: 'false', compositeOnly: 'false',
      categoryKeys: 'c1', warehouse: 'wh1', type: 'pos',
    });
  });

  it('reads settings with warehouseId= and categories with warehouse=', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { success: true, result: { data: [] } } }));
    await api(fn).categories('wh1');
    await api(fn).settings('wh1');
    expect(calls.map((c) => c.url)).toEqual([
      'http://pos.local:3001/api/category/menu?warehouse=wh1',
      'http://pos.local:3001/api/setting?warehouseId=wh1',
    ]);
  });
});

describe('imageUrl', () => {
  it('keeps absolute URLs and resolves relative ones against the server', () => {
    const a = api(fakeFetch(() => ({ json: {} })).fn);
    expect(a.imageUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
    expect(a.imageUrl('/uploads/x.jpg')).toBe('http://pos.local:3001/uploads/x.jpg');
    expect(a.imageUrl('uploads/x.jpg')).toBe('http://pos.local:3001/uploads/x.jpg');
    expect(a.imageUrl(null)).toBeNull();
  });
});

describe('ping', () => {
  it('counts any answer from the server as reachable, even a refusal', async () => {
    expect(await api(fakeFetch(() => ({ status: 401, json: {} })).fn).ping()).toBe(true);
    expect(await api(fakeFetch(() => ({ status: 500, json: {} })).fn).ping()).toBe(true);
  });

  it('is false when the connection fails, and when there is no server address', async () => {
    expect(await api(fakeFetch(() => new Error('Network request failed')).fn).ping()).toBe(false);
    expect(await new KhPosApi('', () => null, fakeFetch(() => ({ json: {} })).fn).ping()).toBe(false);
  });

  it('needs no login', async () => {
    const { fn, calls } = fakeFetch(() => ({ json: {} }));
    await api(fn, null).ping();
    expect(calls[0]!.headers.Authorization).toBeUndefined();
  });
});
