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

describe('saved answers (offline)', () => {
  function withCache() {
    const saved = new Map<string, { value: unknown; savedAt: number }>();
    let up = true;
    const { fn, calls } = fakeFetch((c) => (up ? { json: { success: true, result: { path: c.url.replace('http://kh', '') } } } : new Error('offline')));
    const api = new KhPosApi('http://kh', () => 'tok', fn);
    api.setUrlCache({
      save: (path, value) => void saved.set(path, { value, savedAt: 1000 }),
      load: async (path) => saved.get(path) ?? null,
    });
    return { api, saved, calls, down: () => (up = false) };
  }

  it('keeps the answer of every GET by address, and nothing else', async () => {
    const { api, saved } = withCache();
    await api.call('GET', '/api/category?limit=100&offset=0');
    await api.call('POST', '/api/category', { title: 'x' });
    expect([...saved.keys()]).toEqual(['/api/category?limit=100&offset=0']);
  });

  it('rebuilds a read from the saved answers when asked, and fails like an unreachable server for an address with no copy', async () => {
    const { api, calls, down } = withCache();
    await api.call('GET', '/api/category?limit=100&offset=0');
    down();
    const before = calls.length;
    const r = await api.fromSavedCopies(() => api.call<{ result: { path: string } }>('GET', '/api/category?limit=100&offset=0'));
    expect(r.value.result.path).toBe('/api/category?limit=100&offset=0');
    expect(r.savedAt).toBe(1000);
    expect(calls.length).toBe(before); // no request went out
    await expect(api.fromSavedCopies(() => api.call('GET', '/api/never-read'))).rejects.toMatchObject({ kind: 'network' });
  });

  it('answers a read from the saved copy when kh-pos cannot be reached (getOrSaved), and a product search from the saved catalog', async () => {
    const saved = new Map<string, { value: unknown; savedAt: number }>();
    const products = [
      { id: 'p1', title: 'Green Tea', productVariants: [{ name: 'Std', barcode: '111', sku: 1 }] },
      { id: 'p2', title: 'Coffee', productVariants: [{ name: 'Iced', barcode: '222', sku: 2 }] },
    ];
    saved.set('/api/product-v2?limit=100&offset=0', { value: { success: true, result: { data: products, total: 2 } }, savedAt: 777 });
    const { fn } = fakeFetch(() => new Error('offline'));
    const api = new KhPosApi('http://kh', () => 'tok', fn);
    api.setUrlCache({ save: () => undefined, load: async (path) => saved.get(path) ?? null });
    const exact = await api.getOrSaved<{ result: { data: unknown[] } }>('/api/product-v2?limit=100&offset=0');
    expect(exact.result.data).toHaveLength(2);
    const byTitle = await api.getOrSaved<{ result: { data: { id: string }[]; total: number } }>('/api/product-v2?limit=30&offset=0&searchTitle=tea');
    expect(byTitle.result.data.map((p) => p.id)).toEqual(['p1']);
    const byVariant = await api.getOrSaved<{ result: { data: { id: string }[] } }>('/api/product-v2?limit=30&offset=0&searchTitle=iced');
    expect(byVariant.result.data.map((p) => p.id)).toEqual(['p2']);
    const byBarcode = await api.getOrSaved<{ result: { data: { id: string }[] } }>('/api/product-v2?limit=30&offset=0&barcode=111');
    expect(byBarcode.result.data.map((p) => p.id)).toEqual(['p1']);
    await expect(api.getOrSaved('/api/never-read')).rejects.toMatchObject({ kind: 'network' });
    await expect(api.getOrSaved('/api/product-v2?limit=30&offset=0&searchTitle=tea&categoryId=c1')).rejects.toMatchObject({ kind: 'network' });
  });
});
