import type { OrderLine, TableOrder } from './api';
import { activeLines } from './order';

export type CartDiscountType = 'PERCENTAGE' | 'AMOUNT';

const num = (v: unknown) => Number(v) || 0;
const cents = (n: number) => Math.round(n * 100) / 100;

export interface CartLine {
  orderDetailId: string;
  title: string;
  qty: number;
  gross: number;
  /** Discounts the line already has that are not the manual one (menu discount, promotions). */
  existing: number;
  /** The price the cart discount stacks on: gross minus those. */
  netBase: number;
  hasManual: boolean;
}

/** The order's lines with the figures the web "Discount Cart" sheet works from. */
export function cartLines(order: TableOrder | null | undefined): CartLine[] {
  return activeLines(order).map((l: OrderLine) => {
    const gross = num(l.price) * num(l.qty);
    const existing = (l.discounts ?? []).filter((d) => !d.isManualDiscount).reduce((a, d) => a + num(d.amount), 0);
    return {
      orderDetailId: l.orderDetailId,
      title: l.title,
      qty: num(l.qty),
      gross,
      existing,
      netBase: Math.max(0, gross - existing),
      hasManual: (l.discounts ?? []).some((d) => d.isManualDiscount),
    };
  });
}

/** What the order's manual discounts are now, if they all share a type (to fill the sheet): the web's rule. */
export function currentCartDiscount(order: TableOrder | null | undefined): { type: CartDiscountType; value: number } | null {
  const manuals = activeLines(order).map((l) => (l.discounts ?? []).find((d) => d.isManualDiscount));
  const types = manuals.map((m) => m?.discountType ?? null);
  if (manuals.length === 0 || types.some((t) => t !== types[0]) || !types[0]) return null;
  if (types[0] === 'PERCENTAGE') return { type: 'PERCENTAGE', value: num(manuals[0]?.value) };
  return { type: 'AMOUNT', value: cents(manuals.reduce((a, m) => a + num(m?.amount), 0)) };
}

export type CartDiscountCheck = 'ok' | 'value' | 'percentage' | 'amount' | 'noLines';

export function checkCartDiscount(lines: CartLine[], excluded: Set<string>, type: CartDiscountType, value: number): CartDiscountCheck {
  const included = lines.filter((l) => !excluded.has(l.orderDetailId));
  if (!(value > 0)) return 'value';
  if (type === 'PERCENTAGE' && value > 100) return 'percentage';
  if (included.length === 0) return 'noLines';
  if (type === 'AMOUNT' && value > included.reduce((a, l) => a + l.netBase, 0)) return 'amount';
  return 'ok';
}

/**
 * The discount for each line, as kh-pos wants it (PUT /api/pos/order/:id/promotion): a percentage
 * is sent as that percentage for every chosen line, an amount is shared in proportion to what
 * each line costs, and a line left out (or an amount of 0) has its manual discount removed.
 */
export function buildCartDiscount(lines: CartLine[], excluded: Set<string>, type: CartDiscountType, value: number): { orderDetailId: string; amount: number; discountType: CartDiscountType }[] {
  const included = lines.filter((l) => !excluded.has(l.orderDetailId));
  const base = included.reduce((a, l) => a + l.netBase, 0);
  return lines.map((l) => {
    if (excluded.has(l.orderDetailId) || !(value > 0)) return { orderDetailId: l.orderDetailId, amount: 0, discountType: type };
    if (type === 'PERCENTAGE') return { orderDetailId: l.orderDetailId, amount: value, discountType: type };
    return { orderDetailId: l.orderDetailId, amount: base > 0 ? value * (l.netBase / base) : 0, discountType: type };
  });
}

/** Removing every manual discount: an amount of 0 on every line. */
export const removeAllDiscounts = (lines: CartLine[]) => lines.map((l) => ({ orderDetailId: l.orderDetailId, amount: 0, discountType: 'AMOUNT' as CartDiscountType }));

/** The money off each chosen line and the order total after it (the sheet's preview, same maths as the web's). */
export function previewCartDiscount(lines: CartLine[], excluded: Set<string>, type: CartDiscountType, value: number) {
  if (!(value > 0)) return null;
  const included = lines.filter((l) => !excluded.has(l.orderDetailId));
  const base = included.reduce((a, l) => a + l.netBase, 0);
  const rows = included.map((l) => {
    const raw = type === 'PERCENTAGE' ? Math.floor(l.netBase * value) / 100 : base > 0 ? value * (l.netBase / base) : 0;
    const manual = Math.min(raw, l.netBase);
    return { orderDetailId: l.orderDetailId, title: l.title, manual: cents(manual), final: cents(l.netBase - manual) };
  });
  const totalManual = cents(rows.reduce((a, r) => a + r.manual, 0));
  const gross = lines.reduce((a, l) => a + l.gross, 0);
  const existing = lines.reduce((a, l) => a + l.existing, 0);
  return { rows, totalManual, finalTotal: cents(gross - existing - totalManual) };
}
