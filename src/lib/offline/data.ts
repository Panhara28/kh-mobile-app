import { ApiError, type Category, type KhPosApi, type MenuProduct, type MenuQuery, type PosInfo, type PromotionOption, type RestaurantTable, type Setting } from '../api';
import { filterMenu } from './menu-local';
import type { LocalStore } from './types';

export interface Loaded<T> {
  data: T;
  /** The saved copy was used because kh-pos couldn't be reached. */
  stale: boolean;
  /** When the saved copy was taken (ms since epoch), when stale. */
  savedAt: number | null;
}

const MENU_PAGE = 20; // the page size the menu query is known to honour
const MENU_MAX_PAGES = 100;
const MENU_MIN_REFRESH_MS = 5 * 60_000;
/** After a failed connection, go straight to the saved copy for this long instead of waiting for another timeout. */
const DOWN_MS = 10_000;

/**
 * Read-through cache over the kh-pos API: every successful read is saved on the phone, and when
 * kh-pos can't be reached the saved copy is returned instead (flagged `stale`). Reads that fail
 * for any other reason (wrong login, server error) still fail, and a read with nothing saved
 * fails with the original network error.
 */
export class OfflineData {
  private menuRefresh: Promise<void> | null = null;
  private menuRefreshedAt = 0;
  private downUntil = 0;

  constructor(
    private readonly api: KhPosApi,
    private readonly store: LocalStore,
    /** Branch id of the signed-in staff member: saved data is kept per branch. */
    private readonly scope: string,
    /** Told after every call whether kh-pos answered (the app's Online/Offline state). */
    private readonly reachability: (online: boolean) => void = () => undefined,
  ) {}

  private key(name: string, extra = '') {
    return `${name}:${this.scope}${extra ? `:${extra}` : ''}`;
  }

  /** kh-pos answered, so stop skipping it (called when the app learns it is online again). */
  resetDown(): void {
    this.downUntil = 0;
  }

  /** Runs a live call unless kh-pos was just found unreachable; records what happened. */
  private async live<T>(call: () => Promise<T>): Promise<T> {
    if (Date.now() < this.downUntil) throw new ApiError('network', undefined, 'Server unreachable (recently)');
    try {
      const result = await call();
      this.downUntil = 0;
      this.reachability(true);
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'network') {
        this.downUntil = Date.now() + DOWN_MS;
        this.reachability(false);
      }
      throw e;
    }
  }

  private async read<T>(key: string, fetcher: () => Promise<T>): Promise<Loaded<T>> {
    try {
      const data = await this.live(fetcher);
      await this.store.setCache(key, data).catch(() => undefined); // a full disk must not break reading
      return { data, stale: false, savedAt: null };
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== 'network') throw e;
      const saved = await this.store.getCache<T>(key);
      if (!saved) throw e;
      return { data: saved.value, stale: true, savedAt: saved.savedAt };
    }
  }

  /** The saved table list, without asking kh-pos (for showing table names in the sync list). */
  async cachedTables(): Promise<RestaurantTable[]> {
    return (await this.store.getCache<RestaurantTable[]>(this.key('tables')))?.value ?? [];
  }

  /** What is saved on the phone for this branch, for the sync sheet (so it is clear what offline mode has to work with). */
  async savedSummary(): Promise<{ tables: number; tablesAt: number | null; menuItems: number; menuAt: number | null; categories: number }> {
    const [tables, menu, categories] = await Promise.all([
      this.store.getCache<RestaurantTable[]>(this.key('tables')),
      this.store.getCache<MenuProduct[]>(this.key('menu')),
      this.store.getCache<Category[]>(this.key('categories')),
    ]);
    return {
      tables: tables?.value.length ?? 0,
      tablesAt: tables?.savedAt ?? null,
      menuItems: menu?.value.length ?? 0,
      menuAt: menu?.savedAt ?? null,
      categories: categories?.value.length ?? 0,
    };
  }

  /**
   * Saves what the app needs to work offline: tables, categories, settings and the menu. Best
   * effort and quiet; called when the app starts, comes back, or kh-pos becomes reachable again.
   */
  async warm(warehouseId: string): Promise<void> {
    await Promise.allSettled([this.tables(), this.categories(warehouseId), this.settings(warehouseId), this.refreshMenu(warehouseId)]);
  }

  tables(): Promise<Loaded<RestaurantTable[]>> {
    return this.read(this.key('tables'), () => this.api.tables());
  }

  /** One table with its order. Offline it comes from the saved table list. */
  async table(id: string): Promise<Loaded<RestaurantTable>> {
    try {
      const data = await this.live(() => this.api.table(id));
      void this.upsertTable(data);
      return { data, stale: false, savedAt: null };
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== 'network') throw e;
      const saved = await this.store.getCache<RestaurantTable[]>(this.key('tables'));
      const hit = saved?.value.find((t) => t.id === id);
      if (!saved || !hit) throw e;
      return { data: hit, stale: true, savedAt: saved.savedAt };
    }
  }

  private async upsertTable(table: RestaurantTable): Promise<void> {
    try {
      const key = this.key('tables');
      const saved = await this.store.getCache<RestaurantTable[]>(key);
      if (!saved) return;
      const list = saved.value.some((t) => t.id === table.id) ? saved.value.map((t) => (t.id === table.id ? table : t)) : [...saved.value, table];
      await this.store.setCache(key, list);
    } catch {
      // the cache is a convenience
    }
  }

  categories(warehouseId: string): Promise<Loaded<Category[]>> {
    return this.read(this.key('categories'), () => this.api.categories(warehouseId));
  }

  settings(warehouseId: string): Promise<Loaded<Setting[]>> {
    return this.read(this.key('settings'), () => this.api.settings(warehouseId));
  }

  /** Discounts that can be applied to a dish. Offline only for dishes whose list was loaded before. */
  promotions(productId: string): Promise<Loaded<PromotionOption[]>> {
    return this.read(this.key('promotions', productId), () => this.api.promotionsFor(productId));
  }

  posInfo(warehouseId: string): Promise<Loaded<PosInfo>> {
    return this.read(this.key('posinfo'), () => this.api.posInfo(warehouseId));
  }

  /** A menu page: live from kh-pos, or filtered from the saved menu when it can't be reached. */
  async menu(q: MenuQuery): Promise<Loaded<MenuProduct[]>> {
    try {
      const data = await this.live(() => this.api.menu(q));
      return { data, stale: false, savedAt: null };
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== 'network') throw e;
      const saved = await this.store.getCache<MenuProduct[]>(this.key('menu'));
      if (!saved) throw e;
      return { data: filterMenu(saved.value, q), stale: true, savedAt: saved.savedAt };
    }
  }

  /**
   * Saves the whole menu on the phone (page by page, like the app browses it). Skipped when it
   * was refreshed recently unless `force`; one refresh at a time.
   */
  refreshMenu(warehouseId: string, force = false): Promise<void> {
    if (this.menuRefresh) return this.menuRefresh;
    if (!force && Date.now() - this.menuRefreshedAt < MENU_MIN_REFRESH_MS) return Promise.resolve();
    this.menuRefresh = (async () => {
      const all: MenuProduct[] = [];
      const seen = new Set<string>();
      let offset = 0;
      for (let page = 0; page < MENU_MAX_PAGES; page++) {
        const rows = await this.live(() => this.api.menu({ warehouse: warehouseId, search: '', categoryId: '', limit: MENU_PAGE, offset }));
        offset += rows.length;
        for (const p of rows) {
          if (!seen.has(p.variantId)) {
            seen.add(p.variantId);
            all.push(p);
          }
        }
        if (rows.length < MENU_PAGE) break;
      }
      await this.store.setCache(this.key('menu'), all);
      this.menuRefreshedAt = Date.now();
    })()
      .catch(() => undefined) // best effort: the next refresh tries again
      .finally(() => {
        this.menuRefresh = null;
      });
    return this.menuRefresh;
  }
}
