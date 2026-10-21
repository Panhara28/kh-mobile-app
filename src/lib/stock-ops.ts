/** Hands-on stock work like the kh-pos web product sheets: count a slot, stock in, stock out, move between slots. */

const n = (v: unknown) => Number(v) || 0;

export type StockMode = 'count' | 'in' | 'out' | 'move';
export const STOCK_MODES: StockMode[] = ['count', 'in', 'out', 'move'];

export interface StockLot {
  lot: { id: string; lotNumber?: string; expiredDate?: string; costPerUnit?: string } | null;
  stock: number;
}

export interface StockDetail {
  variant?: { id?: string; name?: string | null; basicProduct?: { title?: string | null } | null } | null;
  stockLot: StockLot[];
}

/** What to show for a lot: its number and expiry, or "no lot". */
export function lotLabel(l: StockLot['lot']): string {
  if (!l) return '';
  return [l.lotNumber, l.expiredDate ? l.expiredDate.slice(0, 10) : null].filter(Boolean).join(' · ');
}

/** The count body: the counted quantity per lot (never negative); null when nothing was counted. */
export function countBody(variantId: string, slotId: string, lots: StockLot[], counted: Record<string, number>) {
  const stockLot = lots.flatMap((l) => {
    if (!l.lot) return [];
    const stock = counted[l.lot.id];
    if (stock === undefined || stock < 0 || !Number.isFinite(stock)) return [];
    return [{ lot: { id: l.lot.id, ...(l.lot.lotNumber ? { lotNumber: l.lot.lotNumber } : {}), ...(l.lot.expiredDate ? { expiredAt: l.lot.expiredDate } : {}), ...(l.lot.costPerUnit ? { costPerUnit: n(l.lot.costPerUnit) } : {}) }, stock }];
  });
  return stockLot.length ? { variantId, slotId, stockLot } : null;
}

/** How far the counted quantity is from the system's (positive = more than recorded). */
export const countDifference = (l: StockLot, counted: number | undefined) => (counted === undefined ? 0 : counted - n(l.stock));

export interface StockInForm {
  qty: number;
  lotNumber: string;
  expiredAt: string;
  cost: number;
}

export function stockInBody(variantId: string, slotId: string, f: StockInForm) {
  if (!slotId || !(n(f.qty) > 0)) return null;
  return {
    variantId,
    slotId,
    qty: n(f.qty),
    ...(f.lotNumber.trim() ? { lotNumber: f.lotNumber.trim() } : {}),
    ...(f.expiredAt.trim() ? { expiredAt: f.expiredAt.trim() } : {}),
    ...(n(f.cost) > 0 ? { costPerUnit: n(f.cost) } : {}),
  };
}

/** Stock out: never more than the slot holds (of the chosen lot, if one is chosen). */
export function stockOutBody(variantId: string, slotId: string, qty: number, available: number, lotId?: string) {
  if (!slotId || !(n(qty) > 0) || n(qty) > n(available)) return null;
  return { variantId, slotId, qty: n(qty), ...(lotId ? { lotId } : {}) };
}

export function moveBody(variantId: string, fromSlotId: string, toSlotId: string, qty: number, available: number) {
  if (!fromSlotId || !toSlotId || fromSlotId === toSlotId || !(n(qty) > 0) || n(qty) > n(available)) return null;
  return { variantId, currentSlotId: fromSlotId, destinationSlotId: toSlotId, qty: n(qty) };
}

export const totalStock = (lots: StockLot[]) => lots.reduce((s, l) => s + n(l.stock), 0);
