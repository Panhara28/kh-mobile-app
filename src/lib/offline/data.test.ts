import { ApiError, type KhPosApi, type MenuProduct } from '../api';
import { OfflineData } from './data';
import { filterMenu } from './menu-local';
import { MemoryStore } from './memory-store';

const product = (id: string, title: string, categoryId = 'c1'): MenuProduct => ({
  productId: `p${id}`,
  variantId: id,
  productTitle: title,
  price: 2,
  category: { id: categoryId, title: categoryId },
});

function setup(api: Partial<KhPosApi>) {
  const store = new MemoryStore();
  const seen: boolean[] = [];
  const data = new OfflineData(api as KhPosApi, store, 'w1', (online) => seen.push(online));
  return { store, data, seen };
}
const down = () => Promise.reject(new ApiError('network', undefined, 'offline'));

describe('OfflineData', () => {
  it('saves what it reads and serves the saved copy when kh-pos cannot be reached', async () => {
    let up = true;
    const { data, seen } = setup({ tables: async () => (up ? [{ id: 't1', table_name: 'A', setting_capacity: 2, section: null, status: 'available', order: null }] : down()) });
    const live = await data.tables();
    expect(live).toMatchObject({ stale: false });
    up = false;
    const saved = await data.tables();
    expect(saved.stale).toBe(true);
    expect(saved.data[0]!.id).toBe('t1');
    expect(saved.savedAt).toEqual(expect.any(Number));
    expect(seen).toEqual([true, false]);
  });

  it('goes straight to the saved copy for a while after a failed connection, then asks again', async () => {
    let calls = 0;
    let up = true;
    const { data } = setup({
      settings: async () => {
        calls++;
        return up ? [] : down();
      },
    });
    await data.settings('w1');
    up = false;
    await data.settings('w1'); // fails, remembered as down
    expect(calls).toBe(2);
    await data.settings('w1');
    await data.settings('w1');
    expect(calls).toBe(2); // not asked again: no waiting for another timeout
    up = true;
    data.resetDown();
    expect((await data.settings('w1')).stale).toBe(false);
    expect(calls).toBe(3);
  });

  it('fails with the network error when nothing has been saved yet', async () => {
    const { data } = setup({ tables: down });
    await expect(data.tables()).rejects.toMatchObject({ kind: 'network' });
  });

  it('does not hide kh-pos refusals behind the saved copy', async () => {
    let fail = false;
    const { data } = setup({ settings: async () => (fail ? Promise.reject(new ApiError('forbidden', 403)) : []) });
    await data.settings('w1');
    fail = true;
    await expect(data.settings('w1')).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('serves one table from the saved list, and keeps the list up to date', async () => {
    const t1 = { id: 't1', table_name: 'A', setting_capacity: 2, section: null, status: 'available' as const, order: null };
    const t2 = { id: 't2', table_name: 'B', setting_capacity: 2, section: null, status: 'available' as const, order: null };
    let up = true;
    const { data, store } = setup({
      tables: async () => [t1, t2],
      table: async (id: string) => (up ? { ...(id === 't1' ? t1 : t2), status: 'order_taken' as const } : down()),
    });
    await data.tables();
    await data.table('t1'); // the newer copy replaces the one in the saved list
    await new Promise((r) => setTimeout(r, 0));
    expect((await store.getCache<{ id: string; status: string }[]>('tables:w1'))!.value.find((t) => t.id === 't1')!.status).toBe('order_taken');
    up = false;
    expect((await data.table('t1')).stale).toBe(true);
    await expect(data.table('missing')).rejects.toMatchObject({ kind: 'network' });
  });

  it('refreshes the whole menu page by page and answers menu queries from it offline', async () => {
    const all = Array.from({ length: 45 }, (_, i) => product(`v${i}`, i % 2 ? `Soup ${i}` : `Rice ${i}`, i < 20 ? 'c1' : 'c2'));
    let up = true;
    const { data } = setup({
      menu: async (q) => (up ? all.slice(q.offset, q.offset + q.limit) : down()),
    });
    await data.refreshMenu('w1', true);
    up = false;
    const rice = await data.menu({ warehouse: 'w1', search: 'RICE', categoryId: '', limit: 100, offset: 0 });
    expect(rice.stale).toBe(true);
    expect(rice.data.every((p) => p.productTitle.startsWith('Rice'))).toBe(true);
    expect(rice.data).toHaveLength(23);
    const page2 = await data.menu({ warehouse: 'w1', search: '', categoryId: 'c2', limit: 20, offset: 20 });
    expect(page2.data).toHaveLength(5);
  });

  it('a failed menu refresh keeps the previous copy', async () => {
    let up = true;
    const { data, store } = setup({ menu: async (q) => (up ? (q.offset === 0 ? [product('v1', 'Rice')] : []) : down()) });
    await data.refreshMenu('w1', true);
    up = false;
    await data.refreshMenu('w1', true);
    expect((await store.getCache<MenuProduct[]>('menu:w1'))!.value).toHaveLength(1);
  });
});

describe('filterMenu', () => {
  const all = [product('a', 'Fried Rice (Large)'), product('b', 'Soup (Std)', 'c2'), product('c', 'Rice Soup', 'c2')];
  it('filters by search and category, and pages', () => {
    expect(filterMenu(all, { search: 'rice', categoryId: '', limit: 10, offset: 0 }).map((p) => p.variantId)).toEqual(['a', 'c']);
    expect(filterMenu(all, { search: '', categoryId: 'c2', limit: 10, offset: 0 }).map((p) => p.variantId)).toEqual(['b', 'c']);
    expect(filterMenu(all, { search: '', categoryId: '', limit: 1, offset: 1 }).map((p) => p.variantId)).toEqual(['b']);
  });
});

describe('the saved product catalog', () => {
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ variantId: `v${from + i}`, productTitle: `Item ${from + i}`, sku: `S${from + i}` }));

  it('reads every page of the product search, and serves the saved copy offline', async () => {
    let up = true;
    const calls: string[] = [];
    const { data } = setup({
      call: (async (_m: string, path: string) => {
        calls.push(path);
        if (!up) return down();
        const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset'));
        return { result: offset === 0 ? page(0, 100) : offset === 100 ? page(100, 30) : [] };
      }) as KhPosApi['call'],
    });
    const live = await data.catalog('w1', { includeNotForSale: true });
    expect(live.stale).toBe(false);
    expect(live.data).toHaveLength(130);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('includeProductNotForSale=true');

    up = false;
    const saved = await data.catalog('w1', { includeNotForSale: true });
    expect(saved.stale).toBe(true);
    expect(saved.data).toHaveLength(130);
  });

  it('keeps one saved copy per kind of search', async () => {
    const { data } = setup({ call: (async () => ({ result: page(0, 3) })) as KhPosApi['call'] });
    await data.catalog('w1', { includeNotForSale: true });
    const other = setup({ call: (async () => down()) as KhPosApi['call'] });
    await expect(other.data.catalog('w1', { includeNotForSale: true })).rejects.toThrow();
  });
});
