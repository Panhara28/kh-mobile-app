/** Replenishment (stock sent from one branch to another) like the kh-pos web Replenishment page. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export type RepStatus = 'draft' | 'approved' | 'receiving' | 'received' | 'deleted';
export const REP_STATUSES: RepStatus[] = ['draft', 'approved', 'receiving', 'received'];

export interface RepRow {
  id: string;
  autoId?: number;
  fromWarehouseId?: { id?: string; name?: string } | null;
  toWarehouseId?: { id?: string; name?: string } | null;
  status: RepStatus;
  createdAt?: string | null;
  totalSentQty?: number;
  totalReceivedQty?: number;
  totalCost?: number;
}

export interface RepItem {
  id: string;
  productVariant?: { id?: string; name?: string | null; basicProduct?: { title?: string | null } | null } | null;
  sentQty: number;
  cost: number;
  receivedQty: number;
}

export interface RepDetail {
  replenishmentInfo: RepRow;
  replenishmentDetails: RepItem[];
  replenishmentPickingList?: PickRow[];
}

export interface RepLine {
  variantId: string;
  name: string;
  sentQty: number;
  cost: number;
}

/** A readable name for an item the server sent. */
export function itemName(i: RepItem): string {
  const v = i.productVariant;
  if (!v) return '?';
  const title = v.basicProduct?.title ?? '';
  const variant = v.name && v.name !== 'ns' ? v.name : '';
  return [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?';
}

export function repTotals(lines: { sentQty: number; cost: number }[]) {
  return { qty: lines.reduce((s, l) => s + n(l.sentQty), 0), cost: cents(lines.reduce((s, l) => s + n(l.sentQty) * n(l.cost), 0)) };
}

export function validateRep(input: { fromWarehouseId: string; toWarehouseId: string; lines: RepLine[] }): 'to' | 'same' | 'lines' | 'qty' | null {
  if (!input.toWarehouseId) return 'to';
  if (input.toWarehouseId === input.fromWarehouseId) return 'same';
  if (input.lines.length === 0) return 'lines';
  if (input.lines.some((l) => !(n(l.sentQty) > 0))) return 'qty';
  return null;
}

export const createRepBody = (input: { fromWarehouseId: string; toWarehouseId: string; lines: RepLine[] }, status: 'draft' | 'approved' = 'draft') => ({
  fromWarehouseId: input.fromWarehouseId,
  toWarehouseId: input.toWarehouseId,
  status,
  replenishmentDetails: input.lines.map((l) => ({ variantId: l.variantId, sentQty: n(l.sentQty), costPerUnit: n(l.cost) })),
});

export const remaining = (i: Pick<RepItem, 'sentQty' | 'receivedQty'>) => Math.max(0, n(i.sentQty) - n(i.receivedQty));

export interface RepPick {
  qty: number;
  slotId: string;
  lotNumber?: string;
  expiredAt?: string;
}

/** The receive body: only chosen items with a slot, never more than remains; null when nothing is to receive. */
export function receiveBody(replenishmentId: string, items: RepItem[], picks: Record<string, RepPick>) {
  const receivedItems = items.flatMap((i) => {
    const p = picks[i.id];
    if (!p || !p.slotId) return [];
    const qty = Math.min(n(p.qty), remaining(i));
    if (!(qty > 0)) return [];
    return [{ replenishmentDetailId: i.id, slotId: p.slotId, qty, costPerUnit: n(i.cost), ...(p.lotNumber?.trim() ? { lotNumber: p.lotNumber.trim() } : {}), ...(p.expiredAt?.trim() ? { expiredAt: p.expiredAt.trim() } : {}) }];
  });
  return receivedItems.length ? { replenishmentId, receivedItems } : null;
}

export function repTone(s: string): 'success' | 'info' | 'warning' | 'destructive' | 'outline' | 'default' {
  if (s === 'received') return 'success';
  if (s === 'approved') return 'info';
  if (s === 'receiving') return 'warning';
  if (s === 'deleted') return 'destructive';
  if (s === 'draft') return 'outline';
  return 'default';
}

export function repQuery(f: { status?: RepStatus; limit: number; offset: number }): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.status) q.set('status', f.status);
  return q.toString();
}

// ---- suggestions (GET /api/replenishment/suggest?fromWarehouseId=) ----

export interface SuggestItem {
  id: string;
  name?: string | null;
  basicProduct?: { title?: string | null } | null;
  stock: number;
  sourceStock: number;
  lowStockQty: number | null;
  idealStockQty: number | null;
  purchasedCost: number | null;
}

export interface SuggestGroup {
  name: string;
  warehouseId: string;
  items: SuggestItem[];
}

/**
 * Lines to send to a branch that is low on stock: up to its ideal level (or its low level when no
 * ideal is set), never more than this branch has, items that would be 0 left out.
 */
export function suggestedLines(items: SuggestItem[]): RepLine[] {
  return items.flatMap((i) => {
    const target = n(i.idealStockQty) > 0 ? n(i.idealStockQty) : n(i.lowStockQty);
    const qty = Math.floor(Math.min(target - n(i.stock), n(i.sourceStock)));
    if (!(qty > 0)) return [];
    const title = i.basicProduct?.title ?? '';
    const variant = i.name && i.name !== 'ns' ? i.name : '';
    return [{ variantId: i.id, name: [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?', sentQty: qty, cost: n(i.purchasedCost) }];
  });
}

// ---- picking list (GET /api/replenishment/{id}/stock-picking-list) ----

export interface PickRow {
  variant?: { id?: string; name?: string | null; basicProduct?: { title?: string | null } | null } | null;
  slot?: { id?: string; name?: string } | null;
  lot?: { id?: string; lotNumber?: string } | null;
  qty: number;
  /** "verified" once the lot was checked by the sender. */
  status?: string | null;
}

export const pickName = (p: Pick<PickRow, 'variant'>) => itemName({ id: '', sentQty: 0, cost: 0, receivedQty: 0, productVariant: p.variant ?? null });

export const isVerified = (p: Pick<PickRow, 'status'>) => p.status === 'verified';

/** Rows that have a lot to verify (rows without one cannot be verified). */
export const verifiable = (rows: PickRow[]) => rows.filter((p) => !!p.lot?.id && !isVerified(p));

export function pickProgress(rows: PickRow[]): { verified: number; total: number } {
  const withLot = rows.filter((p) => !!p.lot?.id);
  return { verified: withLot.filter(isVerified).length, total: withLot.length };
}

/** The lot a typed or scanned lot number belongs to, among the rows still to verify. */
export function matchLotNumber(rows: PickRow[], text: string): PickRow | null {
  const v = text.trim().toLowerCase();
  if (!v) return null;
  return verifiable(rows).find((p) => p.lot?.lotNumber?.trim().toLowerCase() === v) ?? null;
}

/** Saving the pick: every row with its slot, lot and quantity, as kh-pos stores it. */
export function pickBody(rows: PickRow[]) {
  return rows.flatMap((p) => (p.variant?.id && p.slot?.id && p.lot?.id ? [{ variantId: p.variant.id, slotId: p.slot.id, qty: Number(p.qty) || 0, lotId: p.lot.id }] : []));
}
