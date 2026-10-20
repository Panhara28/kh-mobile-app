/**
 * Production like the kh-pos web page (Inventory > Production): pick a composed product, a slot and a
 * quantity; the server plans which component stock is used; "Produce" makes it. Below the form the web
 * lists the recent production (COMPOSE_IN) transactions.
 */

const n = (v: unknown) => Number(v) || 0;

export const PAGE = 30;

// ---- the composed product picker (GET /api/product/search-product?compositeOnly=true) ----

export interface CompositeOption {
  variantId: string;
  productId?: string;
  productTitle: string;
  price?: number | null;
  sku?: string | null;
  barcode?: string | null;
  stock?: number | null;
  purchasedCost?: number | null;
  images?: { url: string }[] | null;
}

/** The products whose title, SKU or barcode contain every typed word (the saved copy of the product search, used offline). */
export function filterOptions(rows: CompositeOption[], text: string): CompositeOption[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => {
    const hay = `${r.productTitle} ${r.sku ?? ''} ${r.barcode ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The web product search; `compositeOnly` for Production, `includeNotForSale` for purchase orders and product groups. */
export function compositeQuery(search: string, warehouseId: string, offset: number, limit = 20, opts: { compositeOnly?: boolean; includeNotForSale?: boolean; forReplenishment?: boolean } = {}): string {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset), replenishment: String(opts.forReplenishment ?? false), compositeOnly: String(opts.compositeOnly ?? true), includeProductNotForSale: String(opts.includeNotForSale ?? false) });
  if (warehouseId) q.set('warehouse', warehouseId);
  if (search.trim()) q.set('search', search.trim());
  return q.toString();
}

// ---- the plan (GET /api/composition/draft) ----

export interface DraftSlot {
  slot?: { id?: string; name?: string } | null;
  lot?: { id?: string; lotNumber?: string } | null;
  qty: number;
  message?: string | null;
}

export interface DraftComponent {
  id: string;
  name?: string | null;
  sku?: string | null;
  price?: number | null;
  basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null;
  availableStock: number;
  requiredStock: number;
  canProduce: boolean;
  stockSlots: DraftSlot[];
}

export const draftQuery = (variantId: string, qty: number) => `variantId=${encodeURIComponent(variantId)}&qty=${qty}`;

export const componentTitle = (c: DraftComponent) => c.basicProduct?.title ?? '';

/** The component's own picture. */
export const componentImage = (c: DraftComponent) => c.basicProduct?.images?.find((i) => i.productVariantId === c.id)?.url ?? null;

/** The web's "Available" / "Low Stock" badge. */
export const isStockSufficient = (c: DraftComponent) => n(c.availableStock) >= n(c.requiredStock);

/** The "2 × 5" line: units of this component for one unit made, times the quantity. */
export const unitRequired = (c: DraftComponent, qty: number) => Math.ceil(n(c.requiredStock) / (n(qty) || 1));

/**
 * "Max Compositions Possible": for each component, how many whole batches its available stock covers at
 * the quantity asked for; the smallest wins.
 */
export function suggestedQty(parts: DraftComponent[], asked: number): number {
  if (parts.length === 0 || !(asked > 0)) return 0;
  return Math.min(...parts.map((c) => (n(c.requiredStock) > 0 ? Math.floor(n(c.availableStock) / (n(c.requiredStock) / asked)) : Infinity)));
}

/** "Exceeds available stock". */
export const exceedsStock = (parts: DraftComponent[], qty: number) => parts.length > 0 && suggestedQty(parts, qty) < qty;

/** With "restrict product lot" on, every slot a component is taken from needs a lot. */
export const missingLots = (parts: DraftComponent[]) => parts.some((c) => c.stockSlots.some((s) => !s.lot?.id));

export function slotLine(s: DraftSlot, restrictLots: boolean): { name: string; lot: string; missingLot: boolean } {
  const missingLot = restrictLots && !s.lot?.id;
  return { name: s.slot?.name ?? s.message ?? '', lot: s.lot?.lotNumber ?? (restrictLots ? '⚠ Required' : 'N/A'), missingLot };
}

export interface ProductionForm {
  variantId: string;
  /** The product's price: sent as the cost per unit of the new stock, as the web does. */
  cost: number;
  qty: number;
  slotId: string;
}

export const emptyProduction = (): ProductionForm => ({ variantId: '', cost: 0, qty: 0, slotId: '' });

/** The web disables Produce until all of this holds. */
export function produceBlocker(f: ProductionForm, parts: DraftComponent[], busy: boolean): 'busy' | 'product' | 'qty' | 'slot' | 'parts' | 'exceeds' | null {
  if (busy) return 'busy';
  if (!f.variantId) return 'product';
  if (!(n(f.qty) > 0)) return 'qty';
  if (!f.slotId) return 'slot';
  if (parts.length === 0) return 'parts';
  if (exceedsStock(parts, n(f.qty))) return 'exceeds';
  return null;
}

/** The body kh-pos wants: what is made and into which slot, and from which slots each component is taken. */
export function productionBody(f: ProductionForm, parts: DraftComponent[]) {
  return {
    composedVariant: { variantId: f.variantId, productLot: { costPerUnit: n(f.cost) }, qty: n(f.qty), slotId: f.slotId },
    componentVariants: parts.map((c) => ({ id: c.id, stockSlots: c.stockSlots.map((s) => ({ slotId: s.slot?.id ?? '', qty: n(s.qty) })) })),
  };
}

/**
 * What the form needs to produce offline: the product, how many, where the new stock goes and its cost. The parts and
 * the slots and lots to take them from are NOT decided on the phone: kh-pos works them out from the stock it has when the
 * change is sent (see planAndProduce).
 */
export interface ProduceIntent {
  variantId: string;
  qty: number;
  slotId: string;
  cost: number;
}

export type ProduceCall = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** The Produce button offline: a product, a quantity and a slot are enough, the parts are checked when it is sent. */
export function produceBlockerOffline(f: ProductionForm, busy: boolean): 'busy' | 'product' | 'qty' | 'slot' | null {
  if (busy) return 'busy';
  if (!f.variantId) return 'product';
  if (!(n(f.qty) > 0)) return 'qty';
  if (!f.slotId) return 'slot';
  return null;
}

/** Why a plan cannot be produced (the first part that is short), or null. */
export function shortage(parts: DraftComponent[], qty: number): string | null {
  if (parts.length === 0) return 'kh-pos has no recipe for this product';
  if (!exceedsStock(parts, qty)) return null;
  const short = parts.find((c) => !isStockSufficient(c));
  return `Not enough stock to produce ${qty}${short ? `: ${componentTitle(short) || short.name || short.id}` : ''}`;
}

/**
 * Produces a quantity the way the Produce button does, but asking kh-pos for the plan right now: the current stock
 * decides which slots and lots the parts come from. Throws with the reason if the stock is short.
 */
export async function planAndProduce(call: ProduceCall, p: ProduceIntent): Promise<void> {
  const draft = (await call('GET', `/api/composition/draft?${draftQuery(p.variantId, p.qty)}`)) as { result?: DraftComponent[] } | undefined;
  const parts = draft?.result ?? [];
  const problem = shortage(parts, p.qty);
  if (problem) throw new Error(problem);
  await call('POST', '/api/composition', productionBody({ variantId: p.variantId, cost: p.cost, qty: p.qty, slotId: p.slotId }, parts));
}

// ---- lot verification (shown when "restrict product lot" is on) ----

export interface LotRow {
  lotNumber: string;
  lotId: string;
  title: string;
  slot: string;
  qty: number;
}

/** One row per lot number, the first time it is seen. */
export function lotRows(parts: DraftComponent[]): LotRow[] {
  const seen = new Set<string>();
  const rows: LotRow[] = [];
  for (const c of parts) {
    for (const s of c.stockSlots) {
      const lotNumber = s.lot?.lotNumber;
      const lotId = s.lot?.id;
      if (!lotNumber || !lotId || seen.has(lotNumber)) continue;
      seen.add(lotNumber);
      rows.push({ lotNumber, lotId, title: c.basicProduct?.title ?? c.name ?? c.id, slot: s.slot?.name ?? '—', qty: n(s.qty) });
    }
  }
  return rows;
}

/** A scanned or typed lot id is matched against the lot ids, like the web. */
export function verifyLot(raw: string, rows: LotRow[], verified: string[]): { result: 'empty' | 'verified' | 'already' | 'missing'; verified: string[] } {
  const code = raw.trim();
  if (!code) return { result: 'empty', verified };
  if (!rows.some((r) => r.lotId === code)) return { result: 'missing', verified };
  if (verified.includes(code)) return { result: 'already', verified };
  return { result: 'verified', verified: [...verified, code] };
}

export const allVerified = (rows: LotRow[], verified: string[]) => rows.length > 0 && rows.every((r) => verified.includes(r.lotId));

// ---- recent production (GET /api/inventory-transactions?status=COMPOSE_IN) ----

export interface ProductionRow {
  id: string;
  transactionType?: string | null;
  qty: number;
  createdAt?: string | null;
  variant?: { name?: string | null; basicProduct?: { title?: string | null; images?: { url: string }[] } | null } | null;
  slot?: { name?: string | null; posSlot?: boolean | number | null; warehouse?: { name?: string | null } | null } | null;
  productLot?: { costPerUnit?: number | string | null } | null;
}

export const historyQuery = (offset: number, limit = PAGE) => new URLSearchParams({ offset: String(offset), limit: String(limit), status: 'COMPOSE_IN' }).toString();

/** The cost of the row: cost per unit times quantity. */
export const rowAmount = (r: ProductionRow) => Math.abs(n(r.productLot?.costPerUnit) * n(r.qty));

export const rowImage = (r: ProductionRow) => r.variant?.basicProduct?.images?.[0]?.url ?? null;

export const slotText = (r: ProductionRow) => (r.slot?.name ? `${r.slot.name}${r.slot.posSlot ? ' (POS)' : ''}` : '');
