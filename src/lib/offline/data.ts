import { ApiError, type Category, type KhPosApi, type MenuProduct, type MenuQuery, type PaymentMethod, type PosInfo, type PromotionOption, type RestaurantTable, type Setting, type Shift } from '../api';
import { fetchAllPages } from '../catalog';
import { filterOrdersLocal, mergeRecentOrders, type OrderFilter, type OrderRow } from '../orders';
import { compositeQuery, type CompositeOption } from '../production';
import type { PromotionSet } from '../promotion-set';
import { groupSeat, openGroups, splitSeat } from '../table-groups';
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
  /** Called with the menu after it has been saved (the app uses it to keep the photos, see provider.tsx). */
  private onMenuSaved: ((menu: MenuProduct[]) => void) | null = null;

  setOnMenuSaved(fn: ((menu: MenuProduct[]) => void) | null): void {
    this.onMenuSaved = fn;
  }

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
      const servedBefore = this.api.savedCopiesServed ?? 0;
      const result = await call();
      // answered from saved copies (another read was rebuilding offline meanwhile): says nothing about kh-pos
      if ((this.api.savedCopiesServed ?? 0) !== servedBefore) return result;
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
      // The same screen read again from the saved answers of its addresses: these are kept fresh in the background for
      // every module, so a screen that was never opened (or opened with other filters) can still be shown.
      const rebuilt = await this.api.fromSavedCopies?.(fetcher).catch(() => null);
      if (rebuilt) return { data: rebuilt.value, stale: true, savedAt: rebuilt.savedAt ?? Date.now() };
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
    await Promise.allSettled([this.tables(), this.categories(warehouseId), this.settings(warehouseId), this.paymentMethods(), this.posInfo(warehouseId), this.refreshMenu(warehouseId)]);
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
      const seat = splitSeat(id);
      const physical = saved?.value.find((t) => t.id === seat.tableId);
      const hit = seat.orderId ? physical && groupSeat(physical, seat.orderId) : physical;
      if (!saved || !hit) throw e;
      return { data: hit, stale: true, savedAt: saved.savedAt };
    }
  }

  private async upsertTable(table: RestaurantTable): Promise<void> {
    try {
      const key = this.key('tables');
      const saved = await this.store.getCache<RestaurantTable[]>(key);
      if (!saved) return;
      const seat = splitSeat(table.id);
      if (seat.orderId) {
        // a group seat: refresh that group inside its table
        const fresh = table.order;
        const merge = (t: RestaurantTable): RestaurantTable => {
          const others = openGroups(t).filter((o) => o.orderId !== seat.orderId);
          const orders = fresh ? [...others, fresh] : others;
          return { ...t, status: table.status, orders, order: orders[0] ?? null };
        };
        await this.store.setCache(key, saved.value.map((t) => (t.id === seat.tableId ? merge(t) : t)));
        return;
      }
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

  /**
   * Any read, saved when it works and served from the saved copy when kh-pos can't be reached.
   * For the modules (orders, reports, stock, ...): `name` and `extra` make the saved key, per branch.
   */
  cachedRead<T>(name: string, extra: string, fetcher: () => Promise<T>): Promise<Loaded<T>> {
    return this.read(this.key(name, extra), fetcher);
  }

  /**
   * The order list. Each list read online is saved as it was asked, and its orders are added to a rolling set of recent
   * orders (with their details, for the first few) so that offline any date, status, invoice or phone filter can be
   * answered from them, not only a list that was opened before.
   */
  async orders(f: OrderFilter): Promise<Loaded<{ totalRows: number; orders: OrderRow[] }>> {
    const recentKey = this.key('orders-recent');
    try {
      const r = await this.read(this.key('orders', JSON.stringify(f)), () => this.api.orders(f));
      if (!r.stale) void this.rememberOrders(recentKey, r.data.orders, (f.offset ?? 0) === 0);
      return r;
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== 'network') throw e;
      const recent = await this.store.getCache<OrderRow[]>(recentKey);
      if (!recent) throw e;
      return { data: filterOrdersLocal(recent.value, f), stale: true, savedAt: recent.savedAt };
    }
  }

  private savedDetails = new Set<string>();

  private async rememberOrders(recentKey: string, fresh: OrderRow[], first: boolean): Promise<void> {
    try {
      const saved = (await this.store.getCache<OrderRow[]>(recentKey))?.value ?? [];
      await this.store.setCache(recentKey, mergeRecentOrders(saved, fresh));
      if (!first) return;
      for (const o of fresh.slice(0, 20)) {
        if (this.savedDetails.has(o.orderId)) continue;
        this.savedDetails.add(o.orderId);
        void this.cachedRead('order', o.orderId, () => this.api.orderDetail(o.orderId)).catch(() => this.savedDetails.delete(o.orderId));
      }
    } catch {
      // best effort: the list itself was already shown
    }
  }

  /** The cashier's recent shifts (their open one is among them). */
  shifts(userId: string): Promise<Loaded<{ total: number; data: Shift[] }>> {
    return this.read(this.key('shifts', userId), () => this.api.shifts({ openedBy: userId, limit: 30 }));
  }

  paymentMethods(): Promise<Loaded<PaymentMethod[]>> {
    return this.read(this.key('paymentmethods'), () => this.api.paymentMethods());
  }

  /** Discounts that can be applied to a dish. Offline only for dishes whose list was loaded before. */
  promotions(productId: string): Promise<Loaded<PromotionOption[]>> {
    return this.read(this.key('promotions', productId), () => this.api.promotionsFor(productId));
  }

  /** Promotion sets for the menu. The saved copy shows them offline, but adding one needs the server. */
  promotionSets(warehouseId: string): Promise<Loaded<PromotionSet[]>> {
    return this.read(this.key('promotionsets', warehouseId), () => this.api.promotionSets(warehouseId));
  }

  /**
   * Every product the product search of a purchase order / replenishment / production form can find, saved so the
   * search still works offline (stock and cost are as of the last time it was saved).
   */
  catalog(warehouseId: string, opts: { compositeOnly?: boolean; includeNotForSale?: boolean; forReplenishment?: boolean }): Promise<Loaded<CompositeOption[]>> {
    const key = this.key('catalog', `${opts.compositeOnly ? 'c' : '-'}${opts.includeNotForSale ? 'n' : '-'}${opts.forReplenishment ? 'r' : '-'}`);
    return this.read(key, () =>
      fetchAllPages<CompositeOption>(async (offset, limit) => {
        const r = await this.api.call<{ result?: CompositeOption[] }>('GET', `/api/product/search-product?${compositeQuery('', warehouseId, offset, limit, opts)}`);
        const got = r.result ?? [];
        // the search does not say how many there are in all: a full page means there may be more
        return { data: got, total: got.length >= limit ? offset + got.length + 1 : offset + got.length };
      }, 100, 60),
    );
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
      this.onMenuSaved?.(all);
    })()
      .catch(() => undefined) // best effort: the next refresh tries again
      .finally(() => {
        this.menuRefresh = null;
      });
    return this.menuRefresh;
  }
}
