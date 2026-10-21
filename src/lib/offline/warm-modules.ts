import type { KhPosApi } from '../api';
import { bookingQuery } from '../accounting';
import { rangeFor, type RangePreset } from '../dates';
import { eodQuery } from '../end-of-day';
import { guestQuery } from '../guest-report';
import { branchSaleQuery } from '../board';
import { dateQuery } from '../reports';
import { itemsQuery } from '../sale-items';
import { saleQuery } from '../sale-report';
import { stockQuery } from '../stock-report';
import { voidQuery } from '../void-report';
import { slotQuery } from '../org';
import { orderQuery } from '../orders';
import { listQuery } from '../product-list';
import { groupListQuery } from '../product-groups';
import { historyQuery } from '../production';
import { poQuery } from '../purchase';
import { repListQuery } from '../replenishment';
import { SHIFT_PAGE } from '../shift';
import { backlogQuery, movementQuery, MOVEMENT_PAGE, returnsQuery } from '../stock-activity';
import { draftQuery } from '../stock-finding';
import { priceQuery } from '../supplier-prices';

/**
 * Background sync of the modules. Every GET the app makes is kept on the phone by address (see KhPosApi.setUrlCache), and
 * a screen shown offline is rebuilt from those copies. This reads the first screen of every module as the screen asks
 * for it, so the copies exist, and stay fresh, without anyone opening the module.
 */

export interface WarmContext {
  userId: string;
  warehouseId: string;
  isMain: boolean;
}

/** Lists read to the end by the screens (a hundred at a time). */
const FULL_LISTS = [
  '/api/category',
  '/api/supplier',
  '/api/warehouse',
  '/api/discount',
  '/api/modifier',
  '/api/promotion-set',
  '/api/user',
  '/api/accounting/chart-of-account',
  '/api/product-v2', // the Retail POS catalog and the pickers
];

/** First pages (30 or 20 a time) of the lists the screens page through, as the screens ask for them. */
export function pagedAddresses(c: WarmContext): string[] {
  const today = rangeFor('today');
  const month = rangeFor('month');
  const pages = (path: string, query: (offset: number) => string, size: number, count = 3) => Array.from({ length: count }, (_, i) => `${path}?${query(i * size)}`);
  return [
    ...pages('/api/product-v2', (o) => listQuery({ text: '', barcode: '', supplierId: '', categoryId: '', limit: 30, offset: o }), 30),
    ...pages('/api/purchase-order', (o) => poQuery({ warehouseId: c.warehouseId, limit: 30, offset: o }), 30),
    ...pages('/api/replenishment', (o) => repListQuery({ isMain: c.isMain, warehouseId: c.warehouseId, offset: o }), 30),
    ...pages('/api/pos/return', (o) => returnsQuery('returned', o), 30, 1),
    ...pages('/api/pos/return', (o) => returnsQuery('stock_in', o), 30, 1),
    ...pages('/api/back-log-order', (o) => backlogQuery(o), 30),
    ...pages('/api/inventory-transactions', (o) => movementQuery([], MOVEMENT_PAGE, o), MOVEMENT_PAGE),
    ...pages('/api/inventory-transactions', (o) => historyQuery(o), 30, 1),
    ...pages('/api/supplier/product-price', (o) => priceQuery({ search: '', supplierId: '', productVariantId: '', order: 'asc', limit: 30, offset: o }), 30, 2),
    ...pages('/api/product-v2/group', (o) => groupListQuery(o, c.warehouseId), 20),
    ...pages('/api/warehouse/slot', (o) => slotQuery(c.warehouseId, '', o), 30, 2),
    ...pages('/api/shift', (o) => `openedBy=${encodeURIComponent(c.userId)}&limit=${SHIFT_PAGE}&offset=${o}`, SHIFT_PAGE, 1),
    ...(today ? pages('/api/pos/order', (o) => orderQuery({ limit: 30, offset: o, startDate: today.start, endDate: today.end }), 30, 2) : []),
    ...pages('/api/pos/order', (o) => orderQuery({ limit: 30, offset: o }), 30, 2),
    `/api/pos/order?${draftQuery('')}`,
    ...(month ? pages('/api/accounting/booking', (o) => bookingQuery({ limit: 30, offset: o, range: month }), 30, 1) : []),
    '/api/printer',
    '/api/user/role',
  ];
}

/** The periods the date pickers of the reports start from. */
const REPORT_PERIODS: RangePreset[] = ['today', 'yesterday', 'week', 'month'];

/**
 * Every report for the usual periods, as the report screens ask for them (first screen, own branch, no extra filters).
 * The period of a report is part of its address, so each is read for today, yesterday, the week and the month.
 */
export function reportAddresses(c: WarmContext): string[] {
  const out = ['/api/reports/expiry'];
  for (const preset of REPORT_PERIODS) {
    const r = rangeFor(preset);
    if (!r) continue;
    const day = { startDate: r.start.slice(0, 10), endDate: r.end.slice(0, 10) };
    const q = dateQuery(r);
    out.push(
      `/api/report/warehouse/sale?${q}`, // the Board dashboard
      ...(c.warehouseId ? [branchSaleQuery({ warehouseId: c.warehouseId, start: r.start, end: r.end })] : []), // and this branch's sales on it
      `/api/report/sale?${q}`,
      `/api/report/metrics?${q}`,
      `/api/report/hot-hour?${q}`,
      `/api/report/end-of-day?${eodQuery(r, c.warehouseId)}`,
      `/api/report/sale/receipt?${itemsQuery(r)}`,
      `/api/report/order/void?${voidQuery(r)}`,
      `/api/report/order/guest?${guestQuery(r)}`,
      `/api/report/stock?${stockQuery({ range: r, warehouseIds: c.warehouseId ? [c.warehouseId] : [], categoryIds: [], productId: '' })}`,
      `/api/report/sale-by-category?${saleQuery({ ...day, warehouseIds: [c.warehouseId], userIds: [], categoryIds: [], productId: '', groupBy: 'product' })}`,
      `/api/report/sale-by-category?${new URLSearchParams({ ...day, warehouseId: c.warehouseId, groupBy: 'product' }).toString()}`,
    );
  }
  return out;
}

/** How many records of a list have their details kept (the first ones, which are the ones people open). */
const DETAILS_PER_LIST = 15;

/** The detail addresses of the first records of a list answer, for the lists whose rows open a detail screen. */
export function detailAddresses(address: string, answer: unknown): string[] {
  const result = (answer as { result?: unknown } | null)?.result;
  const rows = (Array.isArray(result) ? result : (result as { data?: unknown[] } | undefined)?.data ?? []) as { id?: string }[];
  const ids = rows.slice(0, DETAILS_PER_LIST).map((r) => r.id).filter((id): id is string => !!id);
  if (address.startsWith('/api/product-v2?') && address.includes('offset=0')) {
    const variants = (rows as { productVariants?: { id?: string }[] }[])
      .slice(0, DETAILS_PER_LIST)
      .flatMap((p) => (p.productVariants ?? []).map((v) => v.id))
      .filter((v): v is string => !!v)
      .slice(0, 40)
      .map(encodeURIComponent);
    return [
      ...ids.map((id) => `/api/product-v2/${encodeURIComponent(id)}`),
      ...variants.flatMap((v) => [`/api/product-v2/variant-transaction?variant_id=${v}`, `/api/supplier/product-price?productVariantId=${v}&limit=100&offset=0`]),
    ];
  }
  if (address.startsWith('/api/purchase-order?') && address.includes('offset=0')) return ids.map((id) => `/api/purchase-order/detail/${encodeURIComponent(id)}`);
  if (address.startsWith('/api/replenishment?') && address.includes('offset=0')) return ids.map((id) => `/api/replenishment/${encodeURIComponent(id)}`);
  return [];
}

/** A module list read to the end the way fetchAllPages does it (limit=100, offset step 100); gives the rows read. */
async function readAll(api: KhPosApi, path: string, alive: () => boolean): Promise<Record<string, unknown>[]> {
  const joiner = path.includes('?') ? '&' : '?';
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0, page = 0; page < 50 && alive(); page++, offset += 100) {
    const r = await api.call<{ result?: { data?: Record<string, unknown>[]; total?: number } }>('GET', `${path}${joiner}limit=100&offset=${offset}`);
    const data = r.result?.data ?? [];
    rows.push(...data);
    if (data.length < 100 || offset + data.length >= Number(r.result?.total ?? 0)) break;
  }
  return rows;
}

/** How many records of a full list have their sheets (applies-to, bound products, bound branches) kept. */
const SHEETS_PER_LIST = 30;

/** The sheet addresses of the records of a full list: what a discount applies on, a modifier's products, a user's branches. */
export function sheetAddresses(path: string, rows: Record<string, unknown>[]): string[] {
  const id = (r: Record<string, unknown>, key: string) => (typeof r[key] === 'string' ? encodeURIComponent(r[key] as string) : null);
  const some = rows.slice(0, SHEETS_PER_LIST);
  if (path === '/api/discount') return some.flatMap((r) => (id(r, 'id') ? [`/api/discount/applies?id=${id(r, 'id')}`] : []));
  if (path === '/api/modifier') return some.flatMap((r) => (id(r, 'modifierId') ? [`/api/modifier/${id(r, 'modifierId')}`] : []));
  if (path === '/api/user') return some.flatMap((r) => (id(r, 'id') ? [`/api/user/bind-user/group?userId=${id(r, 'id')}`, `/api/user/bind-user?userId=${id(r, 'id')}`] : []));
  return [];
}

/** How far a pass has got. `total` grows as the records of a list are found (their sheets are added). */
export interface WarmProgress {
  done: number;
  total: number;
}

/** Requests in flight at once: enough to cut the wait a lot, few enough not to load the server. */
const CONCURRENCY = 4;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reads everything above, a few requests at a time, and quietly skips what fails (a module the staff member is not
 * allowed to open answers 403, an unused module may answer 404). Stops at once when kh-pos can't be reached or `alive`
 * turns false. Tells `onProgress` after every request; resolves true when the whole pass was done.
 */
export async function warmModules(
  api: KhPosApi,
  c: WarmContext,
  alive: () => boolean = () => true,
  onProgress?: (p: WarmProgress) => void,
  /** Told about every address that could not be read, and why (so it can be shown instead of guessed at). */
  onProblem?: (address: string, reason: string) => void,
): Promise<boolean> {
  const queue: { label: string; run: () => Promise<void> }[] = [];
  let total = 0;
  let done = 0;
  let inFlight = 0;
  let stopped = false;
  const report = () => onProgress?.({ done, total });
  const add = (label: string, run: () => Promise<void>) => {
    total++;
    queue.push({ label, run });
  };
  const get = (address: string) => () => api.call('GET', address).then(() => undefined);

  for (const path of FULL_LISTS) {
    add(path, async () => {
      const rows = await readAll(api, path, alive);
      for (const sheet of sheetAddresses(path, rows)) add(sheet, get(sheet));
    });
  }
  for (const address of [...pagedAddresses(c), ...reportAddresses(c)]) {
    add(address, async () => {
      const answer = await api.call('GET', address);
      for (const detail of detailAddresses(address, answer)) add(detail, get(detail));
    });
  }
  // the delivery customers list asks with its type last; the order type sheet asks for 20
  for (const address of ['/api/auth/customer?limit=100&offset=0&type=delivery', '/api/auth/customer?limit=20&offset=0&type=delivery']) add(address, get(address));
  report();

  async function worker() {
    while (!stopped) {
      const item = queue.shift();
      if (!item) {
        if (inFlight === 0) return; // nothing waiting and nothing running that could add more
        await pause(25);
        continue;
      }
      if (!alive()) {
        stopped = true;
        return;
      }
      inFlight++;
      try {
        await item.run();
      } catch (e) {
        if (isUnreachable(e)) stopped = true; // the rest would fail the same way
        onProblem?.(item.label, reasonOf(e));
      } finally {
        inFlight--;
        done++;
        report();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return !stopped && done >= total;
}

/** Why a read failed, in a few words (shown in the sync sheet). */
export function reasonOf(e: unknown): string {
  const err = e as { kind?: string; status?: number; message?: string };
  const text = [err.kind, err.status ? String(err.status) : '', err.message && err.message !== err.kind ? err.message : ''].filter(Boolean).join(' ');
  return (text || String(e)).slice(0, 120);
}

const isUnreachable = (e: unknown) => e instanceof Error && (e as { kind?: string }).kind === 'network';
