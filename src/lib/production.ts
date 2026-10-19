/** Production like the kh-pos web page: make a composed product (a recipe of other products) from stock. */

const n = (v: unknown) => Number(v) || 0;

export interface DraftSlot {
  slot?: { id?: string; name?: string } | null;
  lot?: { id?: string; lotNumber?: string } | null;
  qty: number;
}

export interface DraftComponent {
  id: string;
  name?: string | null;
  basicProduct?: { title?: string | null } | null;
  availableStock: number;
  requiredStock: number;
  canProduce: boolean;
  stockSlots: DraftSlot[];
}

export const componentName = (c: DraftComponent) => {
  const title = c.basicProduct?.title ?? '';
  const variant = c.name && c.name !== 'ns' ? c.name : '';
  return [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?';
};

/** Components there is not enough stock for. */
export const shortComponents = (parts: DraftComponent[]) => parts.filter((c) => !c.canProduce || n(c.availableStock) < n(c.requiredStock));

/**
 * The most that can be made from the stock, like the web's suggestion: for each component, how
 * many whole batches its available stock covers at the quantity asked for; the smallest wins.
 */
export function suggestedQty(parts: DraftComponent[], asked: number): number {
  if (parts.length === 0 || !(asked > 0)) return 0;
  return Math.min(...parts.map((c) => (n(c.requiredStock) > 0 ? Math.floor(n(c.availableStock) / (n(c.requiredStock) / asked)) : Infinity)));
}

/** With "restrict product lot" on, every slot a component is taken from must have a lot. */
export const missingLots = (parts: DraftComponent[]) => parts.some((c) => c.stockSlots.some((s) => !s.lot?.id));

export interface ProductionForm {
  variantId: string;
  qty: number;
  slotId: string;
  lotNumber: string;
  expiredAt: string;
  cost: number;
}

export function validateProduction(f: ProductionForm, parts: DraftComponent[], restrictLots: boolean): 'product' | 'qty' | 'slot' | 'parts' | 'short' | 'lots' | null {
  if (!f.variantId) return 'product';
  if (!(n(f.qty) >= 1)) return 'qty';
  if (!f.slotId) return 'slot';
  if (parts.length === 0) return 'parts';
  if (shortComponents(parts).length > 0) return 'short';
  if (restrictLots && missingLots(parts)) return 'lots';
  return null;
}

/** The body kh-pos wants: what is made and into which slot, and from which slots each component is taken. */
export function productionBody(f: ProductionForm, parts: DraftComponent[]) {
  return {
    composedVariant: {
      variantId: f.variantId,
      slotId: f.slotId,
      qty: n(f.qty),
      productLot: {
        ...(f.lotNumber.trim() ? { lotNumber: f.lotNumber.trim() } : {}),
        ...(f.expiredAt.trim() ? { expiredAt: f.expiredAt.trim() } : {}),
        ...(n(f.cost) > 0 ? { costPerUnit: n(f.cost) } : {}),
      },
    },
    componentVariants: parts.map((c) => ({ id: c.id, stockSlots: c.stockSlots.map((s) => ({ slotId: s.slot?.id ?? '', qty: n(s.qty) })) })),
  };
}
