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

export const MOVEMENT_TYPES = ['SALE', 'PURCHASE', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REPLENISHMENT', 'REPLENISHMENT_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'RETURN'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface MovementRow {
  id: string;
  transactionType: string | null;
  qty: number;
  variant?: VariantRef | null;
  slot?: { name?: string | null } | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
  createdAt?: string | null;
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
  productVariant?: VariantRef | null;
  orderInvoiceNumber?: string | number | null;
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
  slot?: { name?: string | null } | null;
  variant?: VariantRef | null;
  qty: number;
  createdAt?: string | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
}

/** Oldest first: what has waited longest. */
export const oldestFirst = <T extends { createdAt?: string | null }>(rows: T[]) => [...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
