import type { ModifierItem, OrderLine, TableOrder } from './api';
import { canCheckout } from './order';
import { methodNames, receiptFromCheckout, receiptFromDetail, receiptHtml, receiptText, type ReceiptLabels } from './receipt';

const line = (id: string, status: Record<string, number>, over: Partial<OrderLine> = {}): OrderLine => {
  const entries = Object.entries(status).map(([s, qty]) => ({ status: s as 'served', qty }));
  const qty = entries.reduce((a, e) => a + e.qty, 0);
  return { orderDetailId: id, variantId: id, title: `Fried rice (Large)`, qty, price: '2.5', totalAmount: String(qty * 2.5), status: entries, orderModifiers: [], ...over };
};
const order = (items: OrderLine[], over: Partial<TableOrder> = {}): TableOrder => ({ orderId: 'o1', invoiceNo: 42, totalAmount: '5', items, ...over });

const labels: ReceiptLabels = { title: 'Receipt', invoice: 'Invoice', table: 'Table', cashier: 'Cashier', guests: 'Guests', date: 'Date', total: 'Total', discount: 'Discount', paid: 'Paid', change: 'Change', thanks: 'Thank you!', notSent: 'Not in KH POS yet' };

describe('canCheckout', () => {
  it('needs everything served and the order open', () => {
    expect(canCheckout(order([line('a', { served: 2 })]))).toBe(true);
    expect(canCheckout(order([line('a', { served: 1, cooking: 1 })]))).toBe(false);
    expect(canCheckout(order([line('a', { served: 1, pending: 1 })]))).toBe(false);
    expect(canCheckout(order([line('a', { served: 1 })], { orderStatus: 'COMPLETED' }))).toBe(false);
    expect(canCheckout(order([line('a', { served: 1 })], { orderStatus: 'DRAFT' }))).toBe(true);
  });
  it('is false for no order or an empty one', () => {
    expect(canCheckout(null)).toBe(false);
    expect(canCheckout(order([]))).toBe(false);
    expect(canCheckout(order([line('a', { served: 0 })]))).toBe(false);
  });
});

describe('receipt', () => {
  const names = new Map<string, ModifierItem>([['m1', { id: 'm1', modifierId: 'g', name: 'Egg', price: 0.5 }]]);
  const methods = methodNames([{ method_id: 'cash', method: 'Cash' }]);
  const paid = line('a', { served: 2 }, { orderModifiers: [{ orderDetailId: 'a', modifierItemId: 'm1' }, { orderDetailId: 'a', modifierItemId: 'notes', notes: 'no chili' }], discountAmount: '0.5' });

  const base = () =>
    receiptFromCheckout({
      order: order([paid], { customer: 3 }),
      tableName: 'A-01',
      cashier: 'Staff',
      names,
      methods,
      payments: [{ amount: 6, paymentMethod: 'cash', currency: 'USD', amountUsd: 6, exchangeRate: 4000, used: 5 }],
      total: 5,
      exchangeRate: 4000,
      currency: 'USD',
      paidAt: '2026-10-19 12:30:00',
      offline: false,
    });

  it('is built from the order that was just paid, with the change', () => {
    const r = base();
    expect(r).toMatchObject({ invoiceNo: '42', tableName: 'A-01', guests: 3, total: 5, discount: 0.5, change: 1, offline: false });
    expect(r.lines[0]).toMatchObject({ qty: 2, total: 5, extras: ['Egg', '"no chili"'] });
    expect(r.payments[0]).toMatchObject({ method: 'Cash', amount: 6 });
  });

  it('has no invoice number for an order made offline', () => {
    const r = receiptFromCheckout({ ...{ order: order([paid], { localOnly: true, invoiceNo: '' }) }, tableName: null, cashier: null, names, methods, payments: [], total: 5, exchangeRate: 4000, currency: 'USD', paidAt: '', offline: true });
    expect(r.invoiceNo).toBe('');
    expect(r.offline).toBe(true);
  });

  it("is built from kh-pos' copy of a paid order", () => {
    const r = receiptFromDetail(
      { orderInfo: { orderId: 'o1', invoiceNo: 7, totalAmount: '5', paidAt: '2026-10-19 12:31:00', tableName: 'B-02', customer: 2, createdBy: { fullname: 'Sok' } }, orderDetail: [paid], payments: [{ paymentMethod: 'cash', amount: '20000', currency: 'KHR', amountUsd: '5' }] },
      { names, methods, exchangeRate: 4000, currency: 'USD' },
    );
    expect(r).toMatchObject({ invoiceNo: '7', tableName: 'B-02', cashier: 'Sok', change: 0 });
    expect(r.payments[0]).toEqual({ method: 'Cash', currency: 'KHR', amount: 20000, amountUsd: 5 });
  });

  it('prints as text and as a page, with the offline note when it applies', () => {
    const r = base();
    const text = receiptText(r, labels);
    expect(text).toContain('Invoice: #42');
    expect(text).toContain('2 × Fried rice');
    expect(text).toContain('+ Egg');
    expect(text).toContain('Change: $1.00');
    expect(text).not.toContain('Not in KH POS yet');
    expect(receiptText({ ...r, offline: true }, labels)).toContain('Not in KH POS yet');
    const html = receiptHtml({ ...r, tableName: '<b>A</b>' }, labels);
    expect(html).toContain('&lt;b&gt;A&lt;/b&gt;'); // never trusts the table name
    expect(html).toContain('Thank you!');
  });
});
