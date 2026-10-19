/** Purchase orders like the kh-pos web Purchase Order page: list, create, approve, receive stock, delete. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export type PoStatus = 'draft' | 'approved' | 'completed' | 'deleted' | 'closed';
export const PO_STATUSES: PoStatus[] = ['draft', 'approved', 'completed', 'closed'];

export interface PoRow {
  id: string;
  poIncrement?: string | null;
  status: PoStatus;
  total?: string | number | null;
  totalQty?: number;
  supplier?: { name?: string | null } | null;
  purchasedAt?: string | null;
  expectedAt?: string | null;
  receivedTotal?: number;
}

export interface PoItem {
  id: string;
  name: string | null;
  stock?: number | null;
  qty: number | null;
  amount: number | null;
  receivedQty: number | null;
  purchaseCost: string | null;
  productVariantId: string | null;
  status?: 'pending' | 'received' | 'cancelled' | 'to_create' | 'to_delete';
}

export interface PoExtraCost {
  id: string;
  name: string | null;
  cost: string | null;
  status?: 'pending' | 'received' | 'cancelled' | 'to_create' | 'to_delete';
}

export interface PoDetail {
  id: string;
  supplierId: string;
  status: PoStatus;
  warehouseId: string;
  purchasedAt: string;
  expectedAt: string | null;
  note: string | null;
  items: PoItem[];
  additionalCosts: PoExtraCost[];
  poIncrement?: string | null;
  supplier?: { name?: string | null } | null;
  total?: string | null;
}

// ---- making one ----

export interface PoLine {
  variantId: string;
  name: string;
  qty: number;
  cost: number;
}

export interface PoExtra {
  name: string;
  cost: number;
}

export function poTotals(lines: PoLine[], extras: PoExtra[]) {
  const items = cents(lines.reduce((a, l) => a + n(l.qty) * n(l.cost), 0));
  const extra = cents(extras.reduce((a, e) => a + n(e.cost), 0));
  return { items, extra, total: cents(items + extra) };
}

export function validatePo(input: { supplierId: string; lines: PoLine[] }): string | null {
  if (!input.supplierId) return 'supplier';
  if (input.lines.length === 0) return 'lines';
  if (input.lines.some((l) => !(l.qty > 0))) return 'qty';
  if (input.lines.some((l) => l.cost < 0)) return 'cost';
  return null;
}

/** The body kh-pos wants to create a purchase order (a draft until approved). */
export function createPoBody(input: { supplierId: string; warehouseId: string; purchasedAt: string; expectedAt: string | null; note: string; lines: PoLine[]; extras: PoExtra[] }, newId: () => string) {
  return {
    supplierId: input.supplierId,
    status: 'draft' as PoStatus,
    warehouseId: input.warehouseId,
    purchasedAt: input.purchasedAt,
    expectedAt: input.expectedAt,
    note: input.note.trim() || null,
    items: input.lines.map((l) => ({
      id: newId(),
      name: l.name,
      stock: null,
      qty: l.qty,
      amount: cents(l.qty * l.cost),
      receivedQty: 0,
      purchaseCost: String(l.cost),
      productVariantId: l.variantId,
    })),
    additionalCosts: input.extras.filter((e) => e.name.trim()).map((e) => ({ id: newId(), name: e.name.trim(), cost: String(e.cost) })),
  };
}

/** Approving sends the order back as it is with the new status. */
export function statusBody(d: PoDetail, status: PoStatus) {
  return {
    id: d.id,
    supplierId: d.supplierId,
    status,
    warehouseId: d.warehouseId,
    purchasedAt: d.purchasedAt,
    expectedAt: d.expectedAt,
    note: d.note,
    items: d.items.map((i) => ({ id: i.id, name: i.name, stock: i.stock ?? null, qty: i.qty, amount: i.amount, receivedQty: i.receivedQty, purchaseCost: i.purchaseCost, productVariantId: i.productVariantId, ...(i.status ? { status: i.status } : {}) })),
    additionalCosts: d.additionalCosts.map((c) => ({ id: c.id, name: c.name, cost: c.cost, ...(c.status ? { status: c.status } : {}) })),
  };
}

// ---- receiving ----

export const remaining = (i: Pick<PoItem, 'qty' | 'receivedQty'>) => Math.max(0, n(i.qty) - n(i.receivedQty));

export interface ReceivePick {
  qty: number;
  slotId: string;
  lotNumber?: string;
  expiredAt?: string;
}

/** What is received: only items with a quantity above 0, never above what is still to come, each with a slot. */
export function receiveBody(poId: string, items: PoItem[], picks: Record<string, ReceivePick>) {
  const receivedItems = [];
  for (const item of items) {
    const p = picks[item.id];
    if (!p) continue;
    const qty = Math.min(Math.floor(p.qty), remaining(item));
    if (qty < 1 || !p.slotId) continue;
    receivedItems.push({
      purchaseOrderDetailId: item.id,
      slotId: p.slotId,
      qty,
      costPerUnit: n(item.purchaseCost),
      ...(p.lotNumber?.trim() ? { lotNumber: p.lotNumber.trim() } : {}),
      ...(p.expiredAt?.trim() ? { expiredAt: p.expiredAt.trim() } : {}),
    });
  }
  return receivedItems.length > 0 ? { purchaseOrderId: poId, receivedItems } : null;
}

export const statusTone = (s: string) => (s === 'completed' ? 'success' : s === 'approved' ? 'info' : s === 'draft' ? 'outline' : s === 'deleted' ? 'destructive' : 'default') as 'success' | 'info' | 'outline' | 'destructive' | 'default';

export function poQuery(f: { status?: PoStatus; supplierId?: string; limit: number; offset: number }): string {
  const p = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.status) p.set('status', f.status);
  if (f.supplierId) p.set('supplierId', f.supplierId);
  return p.toString();
}
