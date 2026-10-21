/**
 * The Sale Report of the kh-pos web app (Report > Sale Report, and the Sale Breakdown page): sales
 * grouped by category with supply price, modifier, discount, revenue and profit; filters; a chart of
 * the top products by revenue, quantity or profit; export.
 */

const n = (v: unknown) => Number(v) || 0;

export type GroupBy = 'product' | 'time';
export type ChartValue = 'revenue' | 'qty' | 'profit';

export interface SaleRow {
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
  orderedAt?: string;
  categoryName?: string;
}

export interface SaleFilters {
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  warehouseIds: string[];
  userIds: string[];
  categoryIds: string[];
  productId: string;
  groupBy: GroupBy;
}

/** The query the web sends: the end date runs to the end of that day; empty filters are left out. */
export function saleQuery(f: SaleFilters): string {
  const q = new URLSearchParams();
  if (f.startDate) q.set('startDate', f.startDate);
  if (f.endDate) q.set('endDate', `${f.endDate} 23:59:59`);
  if (f.warehouseIds.length > 0) q.set('warehouseId', f.warehouseIds.join(','));
  q.set('groupBy', f.groupBy);
  if (f.userIds.length > 0) q.set('userIds', f.userIds.join(','));
  if (f.categoryIds.length > 0) q.set('categoryIds', f.categoryIds.join(','));
  if (f.productId) q.set('productId', f.productId);
  return q.toString();
}

/** How many filters the web counts as active (the branch only for the owner). */
export function activeFilterCount(f: SaleFilters, isOwner: boolean): number {
  let c = 0;
  if (f.startDate || f.endDate) c++;
  if (f.userIds.length > 0) c++;
  if (f.categoryIds.length > 0) c++;
  if (f.groupBy) c++;
  if (f.productId) c++;
  if (f.warehouseIds.length > 0 && isOwner) c++;
  return c;
}

/** The "Ordered At" column only exists when rows are listed by time. */
export const showOrderedAt = (rows: SaleRow[]) => rows.some((r) => r.type === 'detail' && !!r.orderedAt);

/** 1,234.50 */
export const fmt = (v: number) => n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ChartItem {
  name: string;
  fullName: string;
  value: number;
}

/**
 * The web chart: detail rows added up by name, only values above 0, biggest first, the top 30
 * (more when the 30th is tied). The short name is what comes before " - ".
 */
export function chartItems(rows: SaleRow[], view: ChartValue): ChartItem[] {
  const grouped = new Map<string, ChartItem>();
  for (const r of rows) {
    if (r.type !== 'detail') continue;
    const fullName = r.name || 'Unknown Product';
    const value = view === 'qty' ? r.totalQty : view === 'profit' ? r.profit : r.revenue;
    const e = grouped.get(fullName) ?? { name: fullName.split('-')[0]!.trim(), fullName, value: 0 };
    e.value += n(value);
    grouped.set(fullName, e);
  }
  const sorted = [...grouped.values()].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const limit = 30;
  const cutoff = sorted.length >= limit ? sorted[limit - 1] : sorted[sorted.length - 1];
  return sorted.filter((i) => i.value >= n(cutoff?.value));
}

export const chartCaption = (count: number, view: ChartValue) => (count === 20 ? `Showing top 20 products by ${view}` : `Showing ${count} products by ${view}`);

/** The rows of the Excel export: the same columns as the web, as CSV text. */
export function exportCsv(rows: SaleRow[], groupByProduct: boolean): string {
  const head = ['Type', 'Product Code', 'Product Name', ...(groupByProduct ? [] : ['Ordered At']), 'Quantity', 'Supply Price', 'Total Price', 'Modifier', 'Discount', 'Revenue', 'Profit'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const type = r.type === 'total' ? 'GRAND TOTAL' : r.type === 'category' ? 'Category Summary' : 'Detail';
    const cells = [type, r.productCode || '', r.type === 'total' ? '' : r.name || '', ...(groupByProduct ? [] : [r.orderedAt || '']), r.totalQty, n(r.supplyPrice).toFixed(2), n(r.totalPrice).toFixed(2), n(r.modifier).toFixed(2), n(r.discount).toFixed(2), n(r.revenue).toFixed(2), n(r.profit).toFixed(2)];
    return cells.map(esc).join(',');
  });
  return [head.join(','), ...lines].join('\n');
}

/** Sale-Breakdown-Report-2026-10-01-to-2026-10-05 */
export const exportName = (start: string, end: string) => `Sale-Breakdown-Report-${start}-to-${end}`;

/** Toggles an id in a selection list. */
export const toggleId = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
