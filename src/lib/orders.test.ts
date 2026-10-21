import type { OrderLine } from './api';
import { dayText, parseDay, rangeFor } from './dates';
import { LIST_STATUSES, hasActiveFilters, itemCount, orderActions, orderWhen, searchFilter, servedTypeKey, whoFor, buildReturns, invoiceDigits, orderQuery, refundFor, returnableQty, returnedQty, statusTone, summarize, type OrderRow } from './orders';

const line = (over: Partial<OrderLine> = {}): OrderLine => ({ orderDetailId: 'L1', variantId: 'v', title: 'Dish', qty: 4, price: '2', totalAmount: '8', ...over });
const row = (over: Partial<OrderRow>): OrderRow => ({ orderId: 'o', invoiceNo: 1, orderStatus: 'COMPLETED', createdAt: null, totalAmount: '10', ...over });

describe('date ranges', () => {
  const now = new Date(2026, 9, 19, 14, 30); // 19 Oct 2026

  it('covers whole days in the web format', () => {
    expect(rangeFor('today', now)).toEqual({ start: '2026-10-19 00:00:00', end: '2026-10-19 23:59:59' });
    expect(rangeFor('yesterday', now)).toEqual({ start: '2026-10-18 00:00:00', end: '2026-10-18 23:59:59' });
    expect(rangeFor('week', now)).toEqual({ start: '2026-10-13 00:00:00', end: '2026-10-19 23:59:59' });
    expect(rangeFor('month', now)).toEqual({ start: '2026-09-20 00:00:00', end: '2026-10-19 23:59:59' });
  });

  it('takes typed dates, and refuses wrong or reversed ones', () => {
    expect(rangeFor('custom', now, { from: '2026-10-01', to: '2026-10-05' })).toEqual({ start: '2026-10-01 00:00:00', end: '2026-10-05 23:59:59' });
    expect(rangeFor('custom', now, { from: '2026-10-05', to: '2026-10-01' })).toBeNull();
    expect(rangeFor('custom', now, { from: '2026-13-01', to: '2026-10-05' })).toBeNull();
    expect(rangeFor('custom', now, { from: '', to: '' })).toBeNull();
  });

  it('parses and prints days', () => {
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay(' 2026-02-28 ')).not.toBeNull();
    expect(dayText(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('order list', () => {
  it('keeps only the digits of the invoice box', () => {
    expect(invoiceDigits(' #2026-1234 ')).toBe('2026');
    expect(invoiceDigits('abc')).toBeUndefined();
  });

  it('builds the query like the web filter', () => {
    expect(orderQuery({ status: 'COMPLETED', invoiceNo: '12', startDate: '2026-10-19 00:00:00', endDate: '2026-10-19 23:59:59', limit: 10, offset: 20 })).toBe(
      'limit=10&offset=20&status=COMPLETED&invoiceNo=12&startDate=2026-10-19+00%3A00%3A00&endDate=2026-10-19+23%3A59%3A59',
    );
    expect(orderQuery({})).toBe('limit=30&offset=0');
  });

  it('summarises completed and draft orders', () => {
    const s = summarize([row({ totalAmount: '10.10' }), row({ totalAmount: '5.20' }), row({ orderStatus: 'DRAFT', totalAmount: '3' }), row({ orderStatus: 'CANCELLED', totalAmount: '99' })]);
    expect(s).toMatchObject({ completedCount: 2, completedTotal: 15.3, draftCount: 1, draftTotal: 3 });
  });

  it('colours the status', () => {
    expect([statusTone('COMPLETED'), statusTone('CANCELLED'), statusTone('REFUND'), statusTone('DRAFT'), statusTone('PROCESSING')]).toEqual(['success', 'destructive', 'destructive', 'outline', 'info']);
  });
});

describe('returns', () => {
  it('counts what was returned and what can still be', () => {
    const l = line({ orderReturns: [{ quantity: 1 }, { quantity: 2 }] });
    expect(returnedQty(l)).toBe(3);
    expect(returnableQty(l)).toBe(1);
    expect(returnableQty(line())).toBe(4);
    expect(returnableQty(line({ orderReturns: [{ quantity: 9 }] }))).toBe(0);
  });

  it('refunds the price per portion', () => {
    expect(refundFor(line(), 1)).toBe(2);
    expect(refundFor(line({ totalAmount: '10' }), 3)).toBe(7.5);
    expect(refundFor(line({ qty: 0 }), 1)).toBe(0);
  });

  it('builds the return lines, never above what is returnable, and skips empty ones', () => {
    const lines = [line({ orderDetailId: 'A' }), line({ orderDetailId: 'B', orderReturns: [{ quantity: 3 }] }), line({ orderDetailId: 'C' })];
    const out = buildReturns('o1', lines, { A: { qty: 2, reason: '  cold  ' }, B: { qty: 5 }, C: { qty: 0 } });
    expect(out).toEqual([
      { orderId: 'o1', orderItemId: 'A', quantity: 2, refundAmount: 4, reason: 'cold' },
      { orderId: 'o1', orderItemId: 'B', quantity: 1, refundAmount: 2 },
    ]);
  });
});

describe('customer order page', () => {
  it('searches by invoice digits, phone or ticket code', () => {
    expect(searchFilter('invoice', ' #123 ')).toEqual({ invoiceNo: '123' });
    expect(searchFilter('invoice', 'abc')).toEqual({});
    expect(searchFilter('phone', ' 012345 ')).toEqual({ customerPhone: '012345' });
    expect(searchFilter('ticketCode', 'T9')).toEqual({ ticketCode: 'T9' });
    expect(searchFilter('phone', '  ')).toEqual({});
    expect(orderQuery({ customerPhone: '012', ticketCode: 'T9', shiftId: 's1' })).toContain('customerPhone=012&ticketCode=T9');
    expect(hasActiveFilters({ limit: 30, offset: 0 })).toBe(false);
    expect(hasActiveFilters({ shiftId: 's' })).toBe(true);
    expect(LIST_STATUSES).toEqual(['DRAFT', 'COMPLETED']);
  });
  it('sums completed, draft, expected and per served type', () => {
    const s = summarize([row({ totalAmount: '10', servedType: 'dine_in' }), row({ orderStatus: 'DRAFT', totalAmount: '5.5', servedType: 'dine_in' }), row({ totalAmount: '20', servedType: null }), row({ orderStatus: 'CANCELLED', totalAmount: '1', servedType: 'customer' })]);
    expect(s).toMatchObject({ completedCount: 2, completedTotal: 30, draftCount: 1, draftTotal: 5.5, expectationCount: 4, expectationTotal: 36.5 });
    expect(s.byServedType.map((x) => x.servedType)).toEqual(['unknown', 'dine_in', 'customer']);
    expect(servedTypeKey('weird')).toBe('unknown');
    expect(servedTypeKey('take_away')).toBe('take_away');
  });
  it('shows when, how many, who and which actions', () => {
    expect(orderWhen({ paidAt: 'p', createdAt: 'c' })).toBe('p');
    expect(orderWhen({ paidAt: null, createdAt: 'c' })).toBe('c');
    expect(itemCount({ items: [{ qty: 2 }, { qty: '3' }, {}] })).toBe(5);
    expect(whoFor({ servedType: 'customer', customerLoader: { customerName: 'Sok', phone: '012' } })).toEqual({ kind: 'customer', name: 'Sok', phone: '012' });
    expect(whoFor({ servedType: 'customer' }).name).toBe('Customer');
    expect(whoFor({ servedType: 'dine_in', createdBy: { fullname: 'Dara' } })).toEqual({ kind: 'staff', name: 'Dara' });
    expect(whoFor({}).name).toBe('Unknown');
    expect(orderActions({ orderStatus: 'DRAFT', tableNumber: 't1' })).toEqual(['print', 'view', 'open']);
    expect(orderActions({ orderStatus: 'DRAFT' })).toEqual(['print', 'view']);
    expect(orderActions({ orderStatus: 'COMPLETED' })).toEqual(['print', 'view', 'reverse']);
  });
});
