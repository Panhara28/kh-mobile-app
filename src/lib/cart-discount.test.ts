import type { OrderLine, TableOrder } from './api';
import { buildCartDiscount, cartLines, checkCartDiscount, currentCartDiscount, previewCartDiscount, removeAllDiscounts } from './cart-discount';

const line = (id: string, qty: number, price: number, discounts: OrderLine['discounts'] = []): OrderLine => ({ orderDetailId: id, variantId: id, title: id, qty, price: String(price), totalAmount: String(qty * price), status: [{ status: 'pending', qty }], discounts });
const order = (items: OrderLine[]): TableOrder => ({ orderId: 'o', invoiceNo: 1, totalAmount: '0', items });
const none = new Set<string>();

describe('cart discount', () => {
  const o = order([line('a', 2, 5), line('b', 1, 10, [{ discountId: 'promo', name: 'P', amount: 2 }])]);
  const lines = cartLines(o);

  it('works from each line price less the discounts that are not manual', () => {
    expect(lines.map((l) => [l.orderDetailId, l.gross, l.existing, l.netBase])).toEqual([['a', 10, 0, 10], ['b', 10, 2, 8]]);
  });

  it('a percentage is sent as that percentage for every chosen line; a left-out line is cleared', () => {
    expect(buildCartDiscount(lines, new Set(['b']), 'PERCENTAGE', 10)).toEqual([
      { orderDetailId: 'a', amount: 10, discountType: 'PERCENTAGE' },
      { orderDetailId: 'b', amount: 0, discountType: 'PERCENTAGE' },
    ]);
  });

  it('an amount is shared in proportion to what each line costs', () => {
    const out = buildCartDiscount(lines, none, 'AMOUNT', 9); // net 10 and 8 → 5 and 4
    expect(out.map((r) => Math.round(r.amount * 100) / 100)).toEqual([5, 4]);
    expect(out.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(9);
  });

  it('removing everything sends 0 for every line', () => {
    expect(removeAllDiscounts(lines).map((r) => r.amount)).toEqual([0, 0]);
    expect(buildCartDiscount(lines, none, 'PERCENTAGE', 0).map((r) => r.amount)).toEqual([0, 0]);
  });

  it('refuses a bad value, over 100%, too much money, or nothing chosen', () => {
    expect(checkCartDiscount(lines, none, 'PERCENTAGE', 10)).toBe('ok');
    expect(checkCartDiscount(lines, none, 'PERCENTAGE', 0)).toBe('value');
    expect(checkCartDiscount(lines, none, 'PERCENTAGE', 101)).toBe('percentage');
    expect(checkCartDiscount(lines, none, 'AMOUNT', 19)).toBe('amount');
    expect(checkCartDiscount(lines, none, 'AMOUNT', 18)).toBe('ok');
    expect(checkCartDiscount(lines, new Set(['a', 'b']), 'AMOUNT', 1)).toBe('noLines');
  });

  it('previews the money off and the new total', () => {
    const p = previewCartDiscount(lines, none, 'PERCENTAGE', 10)!;
    expect(p.rows.map((r) => [r.manual, r.final])).toEqual([[1, 9], [0.8, 7.2]]);
    expect(p.totalManual).toBe(1.8);
    expect(p.finalTotal).toBe(16.2); // 20 gross − 2 promo − 1.8
    expect(previewCartDiscount(lines, none, 'AMOUNT', 0)).toBeNull();
  });

  it('fills the sheet from the discounts already there when they share a type', () => {
    const manual = (type: 'PERCENTAGE' | 'AMOUNT', value: number, amount: number) => [{ discountId: 'manual', name: 'M', isManualDiscount: true, discountType: type, value, amount }];
    expect(currentCartDiscount(order([line('a', 1, 10, manual('PERCENTAGE', 15, 1.5)), line('b', 1, 10, manual('PERCENTAGE', 15, 1.5))]))).toEqual({ type: 'PERCENTAGE', value: 15 });
    expect(currentCartDiscount(order([line('a', 1, 10, manual('AMOUNT', 2, 2)), line('b', 1, 10, manual('AMOUNT', 3, 3))]))).toEqual({ type: 'AMOUNT', value: 5 });
    expect(currentCartDiscount(order([line('a', 1, 10, manual('AMOUNT', 2, 2)), line('b', 1, 10)]))).toBeNull();
    expect(currentCartDiscount(null)).toBeNull();
  });
});
