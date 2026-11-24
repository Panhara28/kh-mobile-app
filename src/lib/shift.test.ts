import type { RestaurantTable } from './api';
import { cardSlips, durationText, hasDiscrepancy, shiftDateTime, shiftLines, shiftReceiptHtml, shiftReceiptText, unpaidOrders, variance } from './shift';

describe('shift page helpers', () => {
  const closed = { shift_id: 's', status: 'CLOSE' as const, opened_at: '2026-10-19 08:00:00', closed_at: '2026-10-19 12:30:00', opened_cash_usd: '10', opened_cash_khr: '40000', closed_cash_usd: '100', closed_cash_khr: '50000', actual_cash_usd: '95', actual_cash_khr: '50000', opened_by: { id: 'u', fullname: 'Dara' }, receipt: { orders: 4, sales: 120, payments: 5, openedCashUsd: 10, openedCashKhr: 40000, closedCashUsd: 100, closedCashKhr: 50000, actualCashUsd: 95, actualCashKhr: 50000, cashDiffUsd: -5, cashDiffKhr: 0, amountByMethod: { CASH: { usd: 80, khr: 0, qty: 3 }, ABA: { usd: 40, khr: 0, qty: 2 } }, amountReturned: 3, returns: 1, totalCustomer: 7, avgCustomer: 17 } };
  it('warns on a cash difference above a cent or a riel', () => {
    expect(hasDiscrepancy({ usd: 10, khr: 100 }, { usd: 10, khr: 100 }).any).toBe(false);
    expect(hasDiscrepancy({ usd: 10.01, khr: 100 }, { usd: 10, khr: 100 }).any).toBe(false);
    expect(hasDiscrepancy({ usd: 10.02, khr: 100 }, { usd: 10, khr: 100 })).toEqual({ usd: true, khr: false, any: true });
    expect(hasDiscrepancy({ usd: 10, khr: 102 }, { usd: 10, khr: 100 })).toEqual({ usd: false, khr: true, any: true });
  });
  it('works out variance, duration and card slips', () => {
    expect(variance(closed)).toEqual({ usd: -5, khr: 0 });
    expect(durationText(closed.opened_at, closed.closed_at)).toBe('4 hours');
    expect(durationText('2026-10-19 08:00:00', '2026-10-19 08:40:00')).toBe('40 minutes');
    expect(durationText(null, null)).toBe('N/A');
    expect(cardSlips(closed.receipt)).toBe(2);
    expect(cardSlips(null)).toBe(0);
    expect(shiftDateTime('2026-10-19 08:05:00')).toBe('Oct 19, 2026 08:05');
    expect(shiftDateTime(null)).toBe('N/A');
  });
  it('prints the handover lines', () => {
    const labels = { title: 'Shift', handover: 'Handover', opening: 'Opening', closing: 'Closing', actual: 'Actual', difference: 'Difference', handoverAmount: 'Handover amount', paymentMethod: 'Payments', sales: 'Sales', returns: 'Returns', bills: 'Bills', customers: 'Customers', openedBy: 'Opened by', openedAt: 'Opened', closedAt: 'Closed' };
    const lines = shiftLines(closed, (v) => `$${v}`, (v) => `${v}R`, labels);
    expect(lines.find((l) => l.label === 'Difference (USD)')?.value).toBe('$-5');
    expect(lines.find((l) => l.label === 'ABA (2)')?.value).toBe('$40 · 0R');
    expect(lines.find((l) => l.label === 'Sales')?.bold).toBe(true);
    const text = shiftReceiptText('Shift', lines);
    expect(text).toContain('Opened by: Dara');
    expect(text).toContain('HANDOVER');
    expect(shiftReceiptHtml('A<B', lines)).toContain('A&lt;B');
  });
});

describe('unpaid orders when closing a shift', () => {
  it('lists every open order on the tables, a Table + Tag group with its tag', () => {
    const tables = [
      { id: '1', table_name: 'T-01', order: null, orders: [{ orderId: 'a', tagNo: '001' }, { orderId: 'b', tagNo: '002' }] },
      { id: '2', table_name: 'T-02', order: { orderId: 'c' } },
      { id: '3', table_name: 'T-03', order: null },
    ] as unknown as RestaurantTable[];
    expect(unpaidOrders(tables)).toEqual(['T-01 #001', 'T-01 #002', 'T-02']);
    expect(unpaidOrders([])).toEqual([]);
  });
});
