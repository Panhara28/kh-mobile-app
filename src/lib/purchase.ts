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
  received?: number | null;
  warehouse?: { name?: string | null } | null;
}

export interface PoItem {
  id: string;
  name: string | null;
  sku?: string | number | null;
  image?: string | null;
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
  supplier?: { name?: string | null; contactName?: string | null; contactPhone?: string | null; contactEmail?: string | null; address?: string | null } | null;
  warehouse?: { name?: string | null } | null;
  createdBy?: { id?: string; username?: string | null; fullname?: string | null } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  received?: number | null;
  totalQty?: number;
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
    // the web sends the dates without the time
    purchasedAt: d.purchasedAt ? d.purchasedAt.slice(0, 10) : d.purchasedAt,
    expectedAt: d.expectedAt ? d.expectedAt.slice(0, 10) : null,
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

export function poQuery(f: { status?: PoStatus; supplierId?: string; warehouseId?: string; limit: number; offset: number }): string {
  const p = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.warehouseId) p.set('warehouseId', f.warehouseId);
  if (f.status) p.set('status', f.status);
  if (f.supplierId) p.set('supplierId', f.supplierId);
  return p.toString();
}

// ---- the Purchase Order page of the web app ----

/** "Receiving 3 of 10" / "Received 10 of 10" / "0 of 10", like the web Received column. */
export function receivedText(r: Pick<PoRow, 'received' | 'totalQty'>): string {
  const got = n(r.received);
  const all = n(r.totalQty);
  const state = got > 0 && got < all ? 'Receiving' : got === all ? 'Received' : '';
  return `${state} ${r.received ?? 0} of ${r.totalQty ?? 0}`.trim();
}

export type RowAction = 'open' | 'receive' | 'edit' | 'delete';

/** The web row menu: Approve (draft) or View Details; Create Receive when approved; Edit and Delete until completed. */
export function rowActions(status: PoStatus): RowAction[] {
  const out: RowAction[] = ['open'];
  if (status === 'approved') out.push('receive');
  if (status !== 'completed') out.push('edit', 'delete');
  return out;
}

/** 0 to 100, for the progress bar of the details. */
export const progressPercent = (received: number | null | undefined, total: number | null | undefined) => Math.min(100, (n(received) / (n(total) || 1)) * 100);

/** What was received so far (received quantity × cost, plus the additional costs) and what is left of the order total. */
export function receivedSummary(d: Pick<PoDetail, 'items' | 'additionalCosts' | 'total'>) {
  const items = d.items.reduce((a, i) => a + n(i.receivedQty) * n(i.purchaseCost), 0);
  const extra = d.additionalCosts.reduce((a, c) => a + n(c.cost), 0);
  const received = cents(items + extra);
  const total = n(d.total);
  return { received, remaining: received < total ? cents(total - received) : 0 };
}

/** The web shows "Owner" when you made the order yourself, else the username. */
export const orderedBy = (d: Pick<PoDetail, 'createdBy'>, userId: string | null | undefined) => (d.createdBy?.id && d.createdBy.id === userId ? 'Owner' : (d.createdBy?.username ?? ''));

// ---- the create / edit form (web: create-purchase-order-sheet) ----

export type ItemStatus = 'pending' | 'received' | 'cancelled' | 'to_create' | 'to_delete';

export interface FormItem {
  id: string;
  name: string;
  sku?: string | number | null;
  stock: number;
  qty: number | null;
  /** Kept as typed. */
  purchaseCost: string;
  amount: number;
  receivedQty: number;
  productVariantId: string | null;
  status?: ItemStatus;
}

export interface FormExtra {
  id: string;
  name: string;
  /** Kept as typed. */
  cost: string;
  status?: ItemStatus;
}

export interface PoForm {
  /** Empty when making a new order. */
  id: string;
  /** The status of the order being edited (a new one is saved as draft). */
  status: PoStatus;
  /** The store of an order being edited; empty for a new one (the current branch is used). */
  warehouseId: string;
  supplierId: string;
  /** YYYY-MM-DD */
  purchasedAt: string;
  expectedAt: string;
  note: string;
  items: FormItem[];
  extras: FormExtra[];
}

export const emptyPoForm = (today: string): PoForm => ({ id: '', status: 'draft', warehouseId: '', supplierId: '', purchasedAt: today, expectedAt: '', note: '', items: [], extras: [] });

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/** An existing order loaded for editing. */
export const formFromDetail = (d: PoDetail): PoForm => ({
  id: d.id,
  status: d.status,
  warehouseId: d.warehouseId,
  supplierId: d.supplierId,
  purchasedAt: day(d.purchasedAt),
  expectedAt: day(d.expectedAt),
  note: d.note ?? '',
  items: d.items.map((i) => ({ id: i.id, name: i.name ?? '', sku: i.sku, stock: n(i.stock), qty: i.qty, purchaseCost: String(i.purchaseCost ?? ''), amount: n(i.amount), receivedQty: n(i.receivedQty), productVariantId: i.productVariantId, status: i.status })),
  extras: d.additionalCosts.map((c) => ({ id: c.id, name: c.name ?? '', cost: String(c.cost ?? ''), status: c.status })),
});

export const visibleItems = (f: PoForm) => f.items.filter((i) => i.status !== 'to_delete');
export const visibleExtras = (f: PoForm) => f.extras.filter((c) => c.status !== 'to_delete');

/** A picked product: the web fills the name, stock and the product's purchase cost; an item added while editing is "to_create". */
export interface PickedProduct {
  variantId: string;
  name: string;
  sku?: string | number | null;
  stock?: number | null;
  purchasedCost?: number | null;
}

export function addProduct(f: PoForm, p: PickedProduct, newId: () => string): { form: PoForm; duplicate: boolean } {
  const same = (i: FormItem) => i.productVariantId === p.variantId || (p.sku != null && i.sku != null && String(i.sku) === String(p.sku));
  if (f.items.some((i) => i.status !== 'to_delete' && same(i))) return { form: f, duplicate: true };
  const item: FormItem = { id: newId(), name: p.name, sku: p.sku, stock: n(p.stock), qty: null, purchaseCost: String(p.purchasedCost || 0), amount: 0, receivedQty: 0, productVariantId: p.variantId, ...(f.id ? { status: 'to_create' as ItemStatus } : {}) };
  return { form: { ...f, items: [...f.items, item] }, duplicate: false };
}

/** Quantity and cost change the line amount (quantity × cost). */
export function setItem(f: PoForm, id: string, patch: { qty?: number | null; purchaseCost?: string }): PoForm {
  return {
    ...f,
    items: f.items.map((i) => {
      if (i.id !== id) return i;
      const qty = patch.qty !== undefined ? patch.qty : i.qty;
      const cost = patch.purchaseCost !== undefined ? patch.purchaseCost : i.purchaseCost;
      return { ...i, qty, purchaseCost: cost, amount: n(qty) * n(cost) };
    }),
  };
}

/** While editing a saved order an item is marked "to_delete"; in a new order it is just dropped. */
export function removeItem(f: PoForm, id: string): PoForm {
  return f.id ? { ...f, items: f.items.map((i) => (i.id === id ? { ...i, status: 'to_delete' as ItemStatus } : i)) } : { ...f, items: f.items.filter((i) => i.id !== id) };
}

export const addExtra = (f: PoForm, newId: () => string): PoForm => ({ ...f, extras: [...f.extras, { id: newId(), name: '', cost: '', ...(f.id ? { status: 'to_create' as ItemStatus } : {}) }] });

export function setExtra(f: PoForm, id: string, patch: { name?: string; cost?: string }): PoForm {
  return { ...f, extras: f.extras.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export const removeExtra = (f: PoForm, id: string): PoForm => (f.id ? { ...f, extras: f.extras.map((c) => (c.id === id ? { ...c, status: 'to_delete' as ItemStatus } : c)) } : { ...f, extras: f.extras.filter((c) => c.id !== id) });

export type FormProblem = { kind: 'supplier' } | { kind: 'items' } | { kind: 'qty'; name: string } | { kind: 'extra'; name: string };

/** The web's checks, in its order: a supplier, at least one item, a quantity on every item, an amount on every additional cost. */
export function validateForm(f: PoForm): FormProblem | null {
  if (!f.supplierId) return { kind: 'supplier' };
  const items = visibleItems(f);
  if (items.length === 0) return { kind: 'items' };
  const noQty = items.find((i) => !i.qty);
  if (noQty) return { kind: 'qty', name: noQty.name };
  const noCost = visibleExtras(f).find((c) => !c.cost);
  if (noCost) return { kind: 'extra', name: noCost.name };
  return null;
}

/** Totals shown under the form: items, additional costs and both together. */
export function formTotals(f: PoForm) {
  const items = cents(visibleItems(f).reduce((a, i) => a + n(i.qty) * n(i.purchaseCost), 0));
  const extra = cents(visibleExtras(f).reduce((a, c) => a + n(c.cost), 0));
  return { items, extra, total: cents(items + extra) };
}

/** The body for POST (a new order is a draft) or PUT (the status stays as it is). */
export function saveBody(f: PoForm, currentWarehouseId: string) {
  return {
    ...(f.id ? { id: f.id } : {}),
    supplierId: f.supplierId,
    status: f.id ? f.status : ('draft' as PoStatus),
    warehouseId: f.warehouseId || currentWarehouseId,
    purchasedAt: f.purchasedAt,
    expectedAt: f.expectedAt || null,
    note: f.note || null,
    items: f.items.map((i) => ({ id: i.id, name: i.name, stock: i.stock, qty: i.qty, amount: i.amount, receivedQty: i.receivedQty, purchaseCost: i.purchaseCost, productVariantId: i.productVariantId, ...(i.status ? { status: i.status } : {}) })),
    additionalCosts: f.extras.map((c) => ({ id: c.id, name: c.name, cost: c.cost, ...(c.status ? { status: c.status } : {}) })),
  };
}

// ---- receiving (web: create-receive-sheet, use-receive-form, utils) ----

export type ReceiveMode = 'full' | 'partial' | 'custom';

export interface ReceiveRow {
  qty: number;
  slotId: string;
  slotName?: string;
  lotNumber?: string;
  /** YYYY-MM-DD */
  expiredAt?: string;
  costPerUnit: number;
}

export interface Categories {
  pending: PoItem[];
  partial: PoItem[];
  completed: PoItem[];
}

const share = (i: Pick<PoItem, 'qty' | 'receivedQty'>) => (i.qty ? n(i.receivedQty) / i.qty : 0);

/** Nothing received yet, some received, all received. */
export function categorize(items: PoItem[]): Categories {
  const out: Categories = { pending: [], partial: [], completed: [] };
  for (const i of items) {
    const p = share(i);
    (p === 0 ? out.pending : p < 1 ? out.partial : out.completed).push(i);
  }
  return out;
}

/** Items still to receive first, then partly received, then complete; each group by name when a direction is set. */
export function sortForReceive(items: PoItem[], dir: 'asc' | 'desc' | null): PoItem[] {
  const by = (a: PoItem, b: PoItem) => (dir === 'asc' ? (a.name || '').localeCompare(b.name || '') : dir === 'desc' ? (b.name || '').localeCompare(a.name || '') : 0);
  const c = categorize(items);
  const ordered = (xs: PoItem[]) => (dir ? [...xs].sort(by) : xs);
  return [...ordered(c.pending), ...ordered(c.partial), ...ordered(c.completed)];
}

/** Which items are selected and what each would receive: full = everything left, partial = half (at least 1), custom = nothing selected. */
export function initialReceive(items: PoItem[], mode: ReceiveMode): { rows: Record<string, ReceiveRow>; selected: string[] } {
  const rows: Record<string, ReceiveRow> = {};
  const selected: string[] = [];
  for (const i of items) {
    const max = remaining(i);
    if (max <= 0) continue;
    if (mode !== 'custom') selected.push(i.id);
    rows[i.id] = { qty: mode === 'partial' ? Math.max(1, Math.floor(max * 0.5)) : max, slotId: '', slotName: '', costPerUnit: n(i.purchaseCost) };
  }
  return { rows, selected };
}

/** The web's first error for the selected items, or null. */
export function receiveProblem(selected: string[], rows: Record<string, ReceiveRow>, items: PoItem[]): string | null {
  for (const id of selected) {
    const r = rows[id];
    const item = items.find((i) => i.id === id);
    if (!r || !item) continue;
    if (!r.qty || r.qty <= 0) return `${item.name}: Quantity must be greater than 0`;
    if (!r.slotId) return `${item.name}: Slot is required`;
    const max = remaining(item);
    if (r.qty > max) return `${item.name}: Quantity exceeds available (${max})`;
  }
  return null;
}

/** The request for the selected items, with the expiry as a date. */
export function receiveRequest(poId: string, selected: string[], rows: Record<string, ReceiveRow>) {
  return {
    purchaseOrderId: poId,
    receivedItems: selected.map((id) => {
      const r = rows[id]!;
      return { purchaseOrderDetailId: id, slotId: r.slotId, qty: r.qty, costPerUnit: r.costPerUnit || 0, ...(r.expiredAt ? { expiredAt: r.expiredAt } : {}), ...(r.lotNumber ? { lotNumber: r.lotNumber } : {}) };
    }),
  };
}

/** One slot (or one expiry date) for every item, like the web "apply to all". */
export function applyToAll(rows: Record<string, ReceiveRow>, patch: Partial<Pick<ReceiveRow, 'slotId' | 'slotName' | 'expiredAt'>>): Record<string, ReceiveRow> {
  return Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, { ...r, ...patch }]));
}

/** "Cancel Remaining Items": the order is completed and every item cancelled. */
export function cancelRemainingBody(d: PoDetail) {
  const b = statusBody(d, 'completed');
  return { ...b, items: b.items.map((i) => ({ ...i, status: 'cancelled' as const })) };
}
