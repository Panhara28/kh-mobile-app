/** Stock movements, customer returns waiting to go back into stock, and the backlog of unfilled orders. */

const n = (v: unknown) => Number(v) || 0;

export interface VariantRef {
  name?: string | null;
  basicProduct?: { title?: string | null } | null;
}

/** "Fried rice (Large)" from a variant reference, or "" when it has none. */
export function variantLabel(v: VariantRef | null | undefined): string {
  if (!v) return '';
  const title = v.basicProduct?.title ?? '';
  return v.name && v.name !== 'ns' ? `${title} (${v.name})`.trim() : title;
}

// ---- stock movements (GET /api/inventory-transactions) ----

/** The filter list of the web Transactions page, in its order. */
export const MOVEMENT_TYPES = ['SALE', 'PURCHASE', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REPLENISHMENT', 'REPLENISHMENT_OUT', 'COMPOSE_IN', 'COMPOSE_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'CONVERSION_IN', 'CONVERSION_OUT', 'DAMAGE', 'RETURN'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_PAGE = 30;

export interface MovementRow {
  id: string;
  transactionType: string | null;
  qty: number;
  variant?: (VariantRef & { basicProduct?: { title?: string | null; images?: { url: string }[] } | null }) | null;
  slot?: { name?: string | null; posSlot?: boolean | number | null; warehouse?: { name?: string | null } | null } | null;
  productLot?: { costPerUnit?: number | string | null } | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
  createdAt?: string | null;
}

/** The web row names both replenishment kinds "Replenishment"; the filter list says "In" and "Out". */
export const rowTypeKey = (type: string | null | undefined) => (type === 'REPLENISHMENT_OUT' ? 'REPLENISHMENT' : (type ?? ''));

/** The web quantity cell: sales show without the minus sign. */
export const movementQty = (r: Pick<MovementRow, 'transactionType' | 'qty'>) => (r.transactionType === 'SALE' ? Math.abs(r.qty) : r.qty);

/** The web amount cell: cost per unit times quantity; only a sale is shown without a sign. */
export function movementAmount(r: Pick<MovementRow, 'transactionType' | 'qty' | 'productLot'>): { negative: boolean; value: number } {
  const v = (Number(r.productLot?.costPerUnit) || 0) * r.qty;
  return { negative: r.transactionType !== 'SALE' && r.qty < 0, value: Math.abs(v) };
}

export const movementImage = (r: MovementRow) => r.variant?.basicProduct?.images?.[0]?.url ?? null;

export const movementSlot = (r: MovementRow) => (r.slot?.name ? `${r.slot.name}${r.slot.posSlot ? ' (POS)' : ''}` : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Apr 25, 2026" like the web date column. */
export function movementDate(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
}

/** Stock in is a gain, the rest of the "out" kinds lose stock: used to colour the quantity. */
export function movementDirection(type: string | null | undefined, qty: number): 'in' | 'out' {
  if (/_OUT$|^SALE$|^STOCK_OUT$|^DAMAGE$/.test(type ?? '')) return 'out';
  return qty < 0 ? 'out' : 'in';
}

export function movementQuery(types: string[], limit: number, offset: number): string {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (types.length > 0) p.set('status', types.join(','));
  return p.toString();
}

// ---- returns (GET /api/pos/return) ----

export interface ReturnRow {
  id: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  refundAmount: number;
  reason?: string | null;
  status: 'returned' | 'stock_in';
  returnedAt?: string | null;
  returnedBy?: { fullname?: string | null } | null;
  stockInAt?: string | null;
  stockInBy?: { fullname?: string | null } | null;
  productVariant?: (VariantRef & { id?: string; basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null }) | null;
  orderInvoiceNumber?: string | number | null;
}

export const RETURN_PAGE = 30;

export type ReturnTab = 'returned' | 'stock_in';

/** The web Order Return list: one tab per status, 30 at a time. */
export const returnsQuery = (status: ReturnTab, offset: number, limit = RETURN_PAGE) => new URLSearchParams({ offset: String(offset), limit: String(limit), status }).toString();

/** The "RTN-00001" number the web shows in front of each row. */
export const returnCode = (position: number) => `RTN-${String(position).padStart(5, '0')}`;

/** The web product cell: "Title (Variant)". */
export const returnProduct = (r: Pick<ReturnRow, 'productVariant'>) => `${r.productVariant?.basicProduct?.title ?? ''} (${r.productVariant?.name ?? ''})`;

export const returnImage = (r: Pick<ReturnRow, 'productVariant'>) => r.productVariant?.basicProduct?.images?.find((i) => i.productVariantId === r.productVariant?.id)?.url ?? null;

/** The lines of the status tooltip: when and by whom it was returned and put back in stock. */
export function returnHistory(r: Pick<ReturnRow, 'returnedAt' | 'returnedBy' | 'stockInAt' | 'stockInBy'>): { kind: 'returned' | 'stock_in'; at: string; by: string }[] {
  const out: { kind: 'returned' | 'stock_in'; at: string; by: string }[] = [];
  if (r.returnedAt) out.push({ kind: 'returned', at: r.returnedAt, by: r.returnedBy?.fullname ?? '' });
  if (r.stockInAt) out.push({ kind: 'stock_in', at: r.stockInAt, by: r.stockInBy?.fullname ?? '' });
  return out;
}

/** One line of "Stock info": where a returned item goes back to. */
export interface StockInSlot {
  variant?: (VariantRef & { id?: string; basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null }) | null;
  slot?: { name?: string | null; posSlot?: boolean | number | null } | null;
  qty: number;
}

export const canStockIn = (r: Pick<ReturnRow, 'status'>) => r.status === 'returned';

/** What is waiting to go back to stock, and the money refunded for it. */
export function returnsSummary(rows: ReturnRow[]) {
  const waiting = rows.filter(canStockIn);
  return { waitingCount: waiting.length, waitingQty: waiting.reduce((a, r) => a + n(r.quantity), 0), refunded: Math.round(rows.reduce((a, r) => a + n(r.refundAmount), 0) * 100) / 100 };
}

// ---- backlog (GET /api/back-log-order) ----

export interface BacklogRow {
  id: string;
  orderId: string;
  slot?: { id?: string; name?: string | null; posSlot?: boolean | number | null; warehouse?: { name?: string | null } | null } | null;
  variant?: (VariantRef & { id?: string; sku?: string | number | null; slotStock?: { slotId: string; stock: number }[]; basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null }) | null;
  qty: number;
  createdAt?: string | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
}

export const BACKLOG_PAGE = 30;

export const backlogQuery = (offset: number, limit = BACKLOG_PAGE) => new URLSearchParams({ limit: String(limit), offset: String(offset) }).toString();

/** The "BL-001" number the web shows in front of each row. */
export const backlogCode = (position: number) => `BL-${String(position).padStart(3, '0')}`;

/** Stock of the product in the slot the backlog is for (0 when unknown). */
export const backlogStock = (r: Pick<BacklogRow, 'variant' | 'slot'>) => r.variant?.slotStock?.find((s) => s.slotId === r.slot?.id)?.stock ?? 0;

/** The variant's own picture, else the product's first. */
export const backlogImage = (r: Pick<BacklogRow, 'variant'>) => {
  const imgs = r.variant?.basicProduct?.images ?? [];
  return (imgs.find((i) => i.productVariantId === r.variant?.id) ?? imgs[0])?.url ?? null;
};

/** Oldest first: what has waited longest. */
export const oldestFirst = <T extends { createdAt?: string | null }>(rows: T[]) => [...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
