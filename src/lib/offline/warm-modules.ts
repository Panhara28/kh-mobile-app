import type { KhPosApi } from '../api';
import { bookingQuery } from '../accounting';
import { rangeFor, type RangePreset } from '../dates';
import { eodQuery } from '../end-of-day';
import { guestQuery } from '../guest-report';
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

/** A module list read to the end the way fetchAllPages does it (limit=100, offset step 100). */
async function readAll(api: KhPosApi, path: string, alive: () => boolean): Promise<void> {
  const joiner = path.includes('?') ? '&' : '?';
  for (let offset = 0, page = 0; page < 50 && alive(); page++, offset += 100) {
    const r = await api.call<{ result?: { data?: unknown[]; total?: number } }>('GET', `${path}${joiner}limit=100&offset=${offset}`);
    const got = r.result?.data?.length ?? 0;
    if (got < 100 || offset + got >= Number(r.result?.total ?? 0)) break;
  }
}

/**
 * Reads everything above, one request after another, and quietly skips what fails (a module the staff member is not
 * allowed to open answers 403, an unused module may answer 404). Stops at once when kh-pos can't be reached or `alive`
 * turns false.
 */
export async function warmModules(api: KhPosApi, c: WarmContext, alive: () => boolean = () => true): Promise<void> {
  for (const path of FULL_LISTS) {
    if (!alive()) return;
    try {
      await readAll(api, path, alive);
    } catch (e) {
      if (isUnreachable(e)) return;
    }
  }
  for (const address of [...pagedAddresses(c), ...reportAddresses(c)]) {
    if (!alive()) return;
    try {
      await api.call('GET', address);
    } catch (e) {
      if (isUnreachable(e)) return;
    }
  }
  // the delivery customers list asks with its type last
  try {
    await api.call('GET', '/api/auth/customer?limit=100&offset=0&type=delivery');
  } catch {
    // not available
  }
}

const isUnreachable = (e: unknown) => e instanceof Error && (e as { kind?: string }).kind === 'network';
