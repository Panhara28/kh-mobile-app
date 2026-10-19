/**
 * Report data from kh-pos and the sums the report screens show. Shapes follow the kh-pos API
 * (src/app/api/report/*); the numbers are worked out here the way the web dashboards do.
 */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export type ReportKind = 'dashboard' | 'sale-report' | 'end-of-day' | 'sale-breakdown' | 'sale-item-report' | 'void-order' | 'guest-number' | 'stock-report' | 'expiry';

/** The kh-pos permission resource that gates each report (the same names as the web menu). */
export const REPORT_RESOURCE: Record<ReportKind, string> = {
  dashboard: 'dashboard',
  'sale-report': 'sale-report',
  'end-of-day': 'end-of-day',
  'sale-breakdown': 'sale-breakdown',
  'sale-item-report': 'sale-item-report',
  'void-order': 'void-order',
  'guest-number': 'guest-number',
  'stock-report': 'stock-report',
  expiry: 'expiry',
};

/** Reports that are for a period (the others show the situation now). */
export const REPORT_HAS_DATES: Record<ReportKind, boolean> = {
  dashboard: true,
  'sale-report': true,
  'end-of-day': true,
  'sale-breakdown': true,
  'sale-item-report': true,
  'void-order': true,
  'guest-number': true,
  'stock-report': true,
  expiry: false,
};

export function dateQuery(range: { start: string; end: string }): string {
  return new URLSearchParams({ startDate: range.start, endDate: range.end }).toString();
}

// ---- sales lines (GET /api/report/sale) ----

export interface SaleLine {
  order_detail_id?: string;
  variant_id?: string;
  qty: number | string;
  price?: number | string;
  total_amount: number | string;
  discount_amount?: number | string;
  /** "YYYY-MM-DD" (the paid day). */
  paid_at: string;
}

export interface DayTotal {
  date: string;
  amount: number;
  qty: number;
}

/** Sales per paid day, oldest first. */
export function salesByDay(lines: SaleLine[]): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (const l of lines) {
    const d = (l.paid_at ?? '').slice(0, 10);
    if (!d) continue;
    const row = map.get(d) ?? { date: d, amount: 0, qty: 0 };
    row.amount += n(l.total_amount);
    row.qty += n(l.qty);
    map.set(d, row);
  }
  return [...map.values()].map((r) => ({ ...r, amount: cents(r.amount) })).sort((a, b) => a.date.localeCompare(b.date));
}

export const totalSales = (lines: SaleLine[]) => cents(lines.reduce((a, l) => a + n(l.total_amount), 0));

// ---- profit (GET /api/report/metrics) ----

export interface Metric {
  date: string;
  orderDetailId?: string;
  sale: number | string;
  /** Cost is returned negative by kh-pos (money out of stock). */
  cost: number | string | null;
  profit: number | string | null;
}

/** Sale, cost and profit per day, oldest first; cost is shown as a positive number. */
export function profitByDay(metrics: Metric[]) {
  const map = new Map<string, { date: string; sale: number; cost: number; profit: number }>();
  for (const m of metrics) {
    if (!m.date) continue;
    const row = map.get(m.date) ?? { date: m.date, sale: 0, cost: 0, profit: 0 };
    row.sale += n(m.sale);
    row.cost += -n(m.cost);
    row.profit += n(m.profit);
    map.set(m.date, row);
  }
  return [...map.values()].map((r) => ({ date: r.date, sale: cents(r.sale), cost: cents(r.cost), profit: cents(r.profit) })).sort((a, b) => a.date.localeCompare(b.date));
}

// ---- busy hours (GET /api/report/hot-hour) ----

export interface HotHourRow {
  /** 0 = Monday (MySQL WEEKDAY). */
  week_of_day: number;
  hore_of_week: number;
  total_qty: number;
  total_amount: number;
}

/** The busiest weekday and hour slots by sales, best first. */
export function busiestHours(rows: HotHourRow[], top = 5): HotHourRow[] {
  return [...rows].sort((a, b) => n(b.total_amount) - n(a.total_amount)).slice(0, top);
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

// ---- sold items (GET /api/report/sale/receipt) ----

export interface SoldItem {
  description: string;
  qty: number;
  discount_amount: number;
  total_amount: number;
}

export const topItems = (items: SoldItem[], by: 'amount' | 'qty' = 'amount', top = 50) =>
  [...items].sort((a, b) => (by === 'amount' ? n(b.total_amount) - n(a.total_amount) : n(b.qty) - n(a.qty))).slice(0, top);

// ---- end of day (GET /api/report/end-of-day) ----

export type Summary = Record<string, { qty: number; amount: number }>;

export interface EndOfDayReport {
  totalSale: number;
  transactionCount: number;
  servedSummary: Summary;
  paymentSummary: Summary;
  discountSummary: Summary;
  categorySummary: Summary;
  customerSummary: Summary;
  startDate?: string;
  endDate?: string;
}

/** A summary as rows, largest amount first. */
export function summaryRows(s: Summary | undefined): { name: string; qty: number; amount: number }[] {
  return Object.entries(s ?? {})
    .map(([name, v]) => ({ name, qty: n(v.qty), amount: cents(n(v.amount)) }))
    .sort((a, b) => b.amount - a.amount);
}

// ---- sale breakdown by category (GET /api/report/sale-by-category) ----

export interface SaleBreakdownRow {
  type: 'header' | 'total' | 'category' | 'detail';
  productCode?: string;
  name?: string;
  totalQty: number;
  supplyPrice: number;
  totalPrice: number;
  modifier: number;
  discount: number;
  revenue: number;
  profit: number;
  categoryName?: string;
}

/** Rows grouped under their category, in the order kh-pos sends them, plus the grand total. */
export function breakdownSections(rows: SaleBreakdownRow[]) {
  const total = rows.find((r) => r.type === 'total') ?? null;
  const sections: { category: SaleBreakdownRow; items: SaleBreakdownRow[] }[] = [];
  for (const r of rows) {
    if (r.type === 'category') sections.push({ category: r, items: [] });
    else if (r.type === 'detail') sections.at(-1)?.items.push(r);
  }
  return { total, sections };
}

// ---- voided and abnormal orders (GET /api/report/order/void) ----

export interface VoidRow {
  invoice?: number | string | null;
  orderId?: string | null;
  orderDetailId: string;
  printedAt?: string;
  qtyFromPrintLog: number;
  priceFromPrintLog: number;
  actualQty: number;
  actualPrice: number;
  status: 'ABNORMAL' | 'VOIDED';
}

/** Money that went to the kitchen but is not on the order (the web's void report logic). */
export function voidLoss(rows: VoidRow[]): number {
  return cents(rows.reduce((a, r) => a + Math.max(0, n(r.qtyFromPrintLog) - (r.status === 'VOIDED' ? 0 : n(r.actualQty))) * n(r.priceFromPrintLog), 0));
}

// ---- guests (GET /api/report/order/guest) ----

export interface GuestRow {
  type: 'guest_total' | 'guest_date' | 'guest_time';
  date: string | null;
  hour: string | number | null;
  total_guests: number;
}

export function guestSections(rows: GuestRow[]) {
  const total = rows.find((r) => r.type === 'guest_total')?.total_guests ?? 0;
  const days: { date: string; guests: number; hours: { hour: string; guests: number }[] }[] = [];
  for (const r of rows) {
    if (r.type === 'guest_date') days.push({ date: r.date ?? '', guests: n(r.total_guests), hours: [] });
    else if (r.type === 'guest_time') days.at(-1)?.hours.push({ hour: String(r.hour ?? ''), guests: n(r.total_guests) });
  }
  return { total: n(total), days };
}

// ---- stock (GET /api/report/stock) ----

export interface StockRow {
  type: 'total' | 'warehouse' | 'category' | 'detail';
  product_code: string;
  name: string;
  qty: number;
  cost: number;
  price: number;
}

/** Rows grouped under their category (warehouse headers kept as group titles). */
export function stockSections(rows: StockRow[]) {
  const total = rows.find((r) => r.type === 'total') ?? null;
  const sections: { title: StockRow; items: StockRow[] }[] = [];
  for (const r of rows) {
    if (r.type === 'warehouse' || r.type === 'category') sections.push({ title: r, items: [] });
    else if (r.type === 'detail') sections.at(-1)?.items.push(r);
  }
  return { total, sections };
}

// ---- expiry (GET /api/reports/expiry) ----

export type ExpiryStatus = 'expired' | 'urgent' | 'critical' | 'warning' | 'ok';

export interface ExpiryItem {
  variant?: { id?: string; name?: string; sku?: string | number | null; barcode?: string | null; basicProduct?: { title?: string } | null } | null;
  slot?: { id?: string; name?: string } | null;
  categories?: { categoryId: string }[] | null;
  expiryDate: string;
  quantity: number;
  value: number;
  status: ExpiryStatus;
  daysLeft: number;
}

export interface ExpiryReport {
  productList: ExpiryItem[];
  dashboard: { status: ExpiryStatus; qty: number; value: number; uniqueProductCount: number }[];
  expiryTimeFrame?: { urgent: number; critical: number; warning: number };
  slots?: { id: string; name: string }[];
  categories?: { id: string; title?: string; name?: string }[];
}

export interface ExpiryFilter {
  search: string;
  /** "all" = all products, as the web's "all_products". */
  status: ExpiryStatus | 'all';
  slotId: string;
  categoryId: string;
}

/** The web filters: search (name, SKU, barcode), status, slot and category; the server order is kept. */
export function filterExpiry(items: ExpiryItem[], f: ExpiryFilter): ExpiryItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((p) => {
    if (q) {
      const name = (p.variant?.basicProduct?.title || p.variant?.name || '').toLowerCase();
      const sku = String(p.variant?.sku ?? '').toLowerCase();
      const barcode = (p.variant?.barcode || '').toLowerCase();
      if (!name.includes(q) && !sku.includes(q) && !barcode.includes(q)) return false;
    }
    if (f.status !== 'all' && p.status !== f.status) return false;
    if (f.slotId && p.slot?.id !== f.slotId) return false;
    if (f.categoryId && !p.categories?.some((c) => c.categoryId === f.categoryId)) return false;
    return true;
  });
}

/** The four status cards of a list: quantity, value and how many different products. */
export function expiryDashboard(items: ExpiryItem[]) {
  return (['expired', 'urgent', 'critical', 'warning'] as ExpiryStatus[]).map((status) => {
    const list = items.filter((p) => p.status === status);
    return { status, qty: list.reduce((a, p) => a + n(p.quantity), 0), value: list.reduce((a, p) => a + n(p.value), 0), uniqueProductCount: new Set(list.map((p) => p.variant?.id ?? p.variant?.name)).size };
  });
}

export const expiryTotals = (d: { uniqueProductCount: number; value: number }[]) => ({ items: d.reduce((a, x) => a + n(x.uniqueProductCount), 0), value: cents(d.reduce((a, x) => a + n(x.value), 0)) });

export const EXPIRY_ORDER: ExpiryStatus[] = ['expired', 'urgent', 'critical', 'warning', 'ok'];

/** Soonest-to-expire first, within a chosen status or all that are not "ok". */
export function expiryList(items: ExpiryItem[], status: ExpiryStatus | 'all'): ExpiryItem[] {
  return items
    .filter((i) => (status === 'all' ? i.status !== 'ok' : i.status === status))
    .sort((a, b) => EXPIRY_ORDER.indexOf(a.status) - EXPIRY_ORDER.indexOf(b.status) || n(a.daysLeft) - n(b.daysLeft));
}

/** Width of a bar in a list of bars: share of the largest value, at least a sliver when above zero. */
export function barShare(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(0.03, Math.min(1, value / max));
}
