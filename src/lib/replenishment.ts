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
  createdBy?: { fullname?: string | null } | null;
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
  sku?: string | number | null;
  basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null;
  stock: number;
  sourceStock: number;
  lowStockQty: number | null;
  idealStockQty: number | null;
  purchasedCost: number | null;
}

export interface SuggestGroup {
  name: string;
  total?: number;
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
  variant?: { id?: string; name?: string | null; sku?: string | number | null; stock?: number | null; basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null } | null;
  slot?: { id?: string; name?: string; posSlot?: boolean | number | null; warehouse?: { name?: string | null } | null } | null;
  lot?: { id?: string; lotNumber?: string; expiredDate?: string | null } | null;
  message?: string | null;
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

// ---- the Replenishment page of the web app ----

export const REP_PAGE = 30;

/** "TR-0001" in front of each row. */
export const repCode = (autoId: number | null | undefined) => `TR-${String(autoId ?? 0).padStart(4, '0')}`;

/** The main branch sees every replenishment it sends; any other branch only those sent to it. */
export function repListQuery(f: { status?: RepStatus; isMain: boolean; warehouseId: string; offset: number; limit?: number }): string {
  const q = new URLSearchParams({ limit: String(f.limit ?? REP_PAGE), offset: String(f.offset) });
  if (!f.isMain && f.warehouseId) q.set('toWarehouseId', f.warehouseId);
  if (f.status) q.set('status', f.status);
  return q.toString();
}

/** Tabs: Draft only exists for the main branch. */
export const repFilters = (isMain: boolean): RepStatus[] => (isMain ? ['draft', 'approved', 'receiving', 'received'] : ['approved', 'receiving', 'received']);

/** The column that names the other branch: where it goes (main) or where it came from. */
export const otherBranch = (r: Pick<RepRow, 'fromWarehouseId' | 'toWarehouseId'>, isMain: boolean) => (isMain ? r.toWarehouseId?.name : r.fromWarehouseId?.name) ?? '';

export type RepAction = 'edit' | 'delete' | 'details';

/** Edit and Delete for a draft on the main branch; Details for everything that is not a draft. */
export function repActions(status: RepStatus, isMain: boolean): RepAction[] {
  const out: RepAction[] = [];
  if (status === 'draft' && isMain) out.push('edit', 'delete');
  if (status !== 'draft') out.push('details');
  return out;
}

/** The rows of "General Information". */
export function repInfo(info: RepRow, itemCount: number): { key: string; value: string }[] {
  return [
    { key: 'status', value: info.status },
    { key: 'createdBy', value: info.createdBy?.fullname ?? 'N/A' },
    { key: 'createdAt', value: info.createdAt ? info.createdAt.slice(0, 10) : '' },
    { key: 'from', value: info.fromWarehouseId?.name ?? 'N/A' },
    { key: 'to', value: info.toWarehouseId?.name ?? 'N/A' },
    { key: 'totalItems', value: String(itemCount) },
    { key: 'totalCost', value: String(info.totalCost ?? 0) },
    { key: 'totalSent', value: String(info.totalSentQty ?? 0) },
    { key: 'totalReceived', value: String(info.totalReceivedQty ?? 0) },
  ];
}

// ---- the create / edit form (web: create-replenishment-sheet) ----

export interface RepFormLine {
  variantId: string;
  name: string;
  stock: number;
  sentQty: number;
  costPerUnit: number;
  amount: number;
}

export interface RepForm {
  /** Empty for a new replenishment. */
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: RepFormLine[];
}

export const emptyRepForm = (fromWarehouseId: string): RepForm => ({ id: '', fromWarehouseId, toWarehouseId: '', lines: [] });

/** An existing replenishment loaded for editing. */
export const repFormFrom = (d: RepDetail): RepForm => ({
  id: d.replenishmentInfo.id,
  fromWarehouseId: d.replenishmentInfo.fromWarehouseId?.id ?? '',
  toWarehouseId: d.replenishmentInfo.toWarehouseId?.id ?? '',
  lines: d.replenishmentDetails.map((i) => ({ variantId: i.productVariant?.id ?? '', name: `${i.productVariant?.basicProduct?.title} (${i.productVariant?.name})`, stock: 0, sentQty: n(i.sentQty), costPerUnit: n(i.cost), amount: n(i.sentQty) * n(i.cost) })),
});

/** The web fills quantity 0, the product's price as cost per unit and the stock of this branch. */
export function addRepLine(f: RepForm, p: { variantId: string; name: string; price?: number | null; stock?: number | null }): RepForm {
  if (f.lines.some((l) => l.variantId === p.variantId)) return f;
  return { ...f, lines: [...f.lines, { variantId: p.variantId, name: p.name, stock: n(p.stock), sentQty: 0, costPerUnit: n(p.price), amount: 0 }] };
}

export function setRepLine(f: RepForm, variantId: string, patch: { sentQty?: number; costPerUnit?: number }): RepForm {
  return { ...f, lines: f.lines.map((l) => (l.variantId === variantId ? { ...l, ...patch, amount: cents(n(patch.sentQty ?? l.sentQty) * n(patch.costPerUnit ?? l.costPerUnit)) } : l)) };
}

export const removeRepLine = (f: RepForm, variantId: string): RepForm => ({ ...f, lines: f.lines.filter((l) => l.variantId !== variantId) });

/** The destination must be chosen, and differ from the source (the web warns when they are the same). */
export function repFormProblem(f: RepForm): 'to' | 'same' | 'lines' | 'qty' | null {
  if (!f.toWarehouseId) return 'to';
  if (f.toWarehouseId === f.fromWarehouseId) return 'same';
  if (f.lines.length === 0) return 'lines';
  if (f.lines.some((l) => !(n(l.sentQty) > 0))) return 'qty';
  return null;
}

/** "Check Stock": where each line would be picked from. */
export const pickingFor = (lines: Pick<RepFormLine, 'variantId' | 'sentQty'>[]) => new URLSearchParams({ items: JSON.stringify(lines.map((l) => ({ variantId: l.variantId, toFindQty: n(l.sentQty) }))) }).toString();

/** Saving a new one: create the draft, then store the picking list under its id. Editing: store the picking list, then update. */
export function repSaveBody(f: RepForm) {
  const details = f.lines.map((l) => ({ variantId: l.variantId, sentQty: n(l.sentQty), costPerUnit: n(l.costPerUnit) }));
  return f.id ? { id: f.id, fromWarehouseId: f.fromWarehouseId, toWarehouseId: f.toWarehouseId, replenishmentDetails: details } : { fromWarehouseId: f.fromWarehouseId, toWarehouseId: f.toWarehouseId, status: 'draft' as const, replenishmentDetails: details };
}

export const pickRowsFor = (rows: PickRow[], variantId: string) => rows.filter((r) => r.variant?.id === variantId);

export const repFormTotals = (f: RepForm) => ({ qty: f.lines.reduce((a, l) => a + n(l.sentQty), 0), cost: cents(f.lines.reduce((a, l) => a + n(l.sentQty) * n(l.costPerUnit), 0)) });

// ---- approving with lot verification (restrict product lot) ----

export interface LotRow {
  lotId: string;
  lotNumber: string;
  label: string;
  slot: string;
  qty: number;
}

/** One row per lot number in the picking list. */
export function lotRowsOf(rows: PickRow[]): LotRow[] {
  const seen = new Set<string>();
  const out: LotRow[] = [];
  for (const p of rows) {
    const lotNumber = p.lot?.lotNumber;
    if (!lotNumber || seen.has(lotNumber)) continue;
    seen.add(lotNumber);
    out.push({ lotId: p.lot?.id ?? '', lotNumber, label: `${p.variant?.basicProduct?.title}(${p.variant?.name ?? ''})`, slot: p.slot?.name ?? '', qty: n(p.qty) });
  }
  return out;
}

/** With "restrict product lot" on and lots in the picking list, approving needs every lot verified first. */
export const approvalBlockedByLots = (rows: PickRow[], restrictLot: boolean) => restrictLot && lotRowsOf(rows).length > 0 && lotRowsOf(rows).some((l) => !rows.some((p) => p.lot?.id === l.lotId && isVerified(p)));

// ---- the Product Replenishment page (suggestions per branch) ----

/** The web sends the ideal level when the branch has less of it than this branch holds, otherwise everything this branch has. */
export function webSendQty(i: Pick<SuggestItem, 'idealStockQty' | 'sourceStock'>): number {
  const ideal = n(i.idealStockQty);
  return ideal && ideal < n(i.sourceStock) ? ideal : n(i.sourceStock);
}

export interface SuggestRow {
  variantId: string;
  sentQty: number;
  costPerUnit: number;
}

export const suggestRows = (items: SuggestItem[]): Record<string, SuggestRow> =>
  Object.fromEntries(items.map((i) => [i.id, { variantId: i.id, sentQty: webSendQty(i), costPerUnit: n(i.purchasedCost) }]));

/** Items that can be selected: this branch must have some of them. */
export const selectableIds = (items: SuggestItem[]) => items.filter((i) => n(i.sourceStock) > 0).map((i) => i.id);

/** "To Stock In": how far the branch is under its ideal level. */
export const toStockIn = (i: Pick<SuggestItem, 'idealStockQty' | 'stock'>) => n(i.idealStockQty) - n(i.stock);

/** The web checks the quantity of each selected item: at least 1, at most what this branch holds. */
export function suggestProblem(items: SuggestItem[], selected: string[], rows: Record<string, SuggestRow>): { id: string; kind: 'min' | 'max' } | null {
  for (const id of selected) {
    const item = items.find((x) => x.id === id);
    const r = rows[id];
    if (!item || !r) continue;
    if (!(n(r.sentQty) >= 1)) return { id, kind: 'min' };
    if (n(r.sentQty) > n(item.sourceStock)) return { id, kind: 'max' };
  }
  return null;
}

export function suggestTotals(selected: string[], rows: Record<string, SuggestRow>) {
  let qty = 0;
  let cost = 0;
  for (const id of selected) {
    const r = rows[id];
    if (!r) continue;
    qty += n(r.sentQty);
    cost += n(r.sentQty) * n(r.costPerUnit);
  }
  return { qty, cost: cents(cost) };
}

/** A draft from the selected suggestions, sent from the main branch to the branch that is low. */
export const suggestBody = (fromWarehouseId: string, toWarehouseId: string, selected: string[], rows: Record<string, SuggestRow>) => ({
  fromWarehouseId,
  toWarehouseId,
  status: 'draft' as const,
  replenishmentDetails: selected.filter((id) => rows[id]).map((id) => ({ variantId: id, sentQty: n(rows[id]!.sentQty), costPerUnit: n(rows[id]!.costPerUnit) })),
});
