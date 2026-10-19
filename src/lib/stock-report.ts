/** The Stock Report of the kh-pos web app: stock per branch and category with cost, price and totals. */

const n = (v: unknown) => Number(v) || 0;

export interface StockLine {
  type: 'total' | 'warehouse' | 'category' | 'detail' | string;
  product_code?: string;
  name?: string;
  qty: number;
  cost: number;
  price: number;
}

/** The server needs both dates (it answers an error without them), as the web sends them. */
export function stockQuery(f: { range: { start: string; end: string }; warehouseIds: string[]; categoryIds: string[]; productId: string }): string {
  const q = new URLSearchParams({ startDate: f.range.start.slice(0, 10), endDate: `${f.range.end.slice(0, 10)} 23:59:59` });
  if (f.warehouseIds.length > 0) q.set('warehouseId', f.warehouseIds.join(','));
  if (f.categoryIds.length > 0) q.set('categoryIds', f.categoryIds.join(','));
  if (f.productId) q.set('productId', f.productId);
  return q.toString();
}

/** Filters the web counts (the date range is not one of them here). */
export const stockFilterCount = (f: { warehouseIds: string[]; categoryIds: string[]; productId: string }, isOwner: boolean) => (f.categoryIds.length > 0 ? 1 : 0) + (f.productId ? 1 : 0) + (f.warehouseIds.length > 0 && isOwner ? 1 : 0);

/** Detail rows show cost and price per unit; summary rows show them as totals. */
export function stockCells(r: StockLine): { cost: number | null; price: number | null; qty: number; totalCost: number; totalPrice: number } {
  const detail = r.type === 'detail';
  return { cost: detail ? n(r.cost) : null, price: detail ? n(r.price) : null, qty: n(r.qty), totalCost: detail ? n(r.cost) * n(r.qty) : n(r.cost), totalPrice: detail ? n(r.price) * n(r.qty) : n(r.price) };
}

export function stockCsv(rows: StockLine[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const type = (t: string) => (t === 'total' ? 'GRAND TOTAL' : t === 'category' ? 'Category Summary' : t === 'warehouse' ? 'Branch Summary' : 'Detail');
  const lines = rows.map((r) => {
    const c = stockCells(r);
    return [type(r.type), r.product_code || '', r.type === 'total' ? '' : r.name || '', c.cost === null ? '' : c.cost.toFixed(2), c.price === null ? '' : c.price.toFixed(2), c.qty, c.totalCost.toFixed(2), c.totalPrice.toFixed(2)].map(esc).join(',');
  });
  return ['Type,Product Code,Product Name,Cost,Price,Quantity,Total Cost,Total Price', ...lines].join('\n');
}
