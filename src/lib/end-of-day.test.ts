import { averageOrder, discountTypes, eodEntries, eodHtml, eodLines, eodQuery, eodText, topCustomers, totalDiscounts, type EodReport, type EodLabels } from './end-of-day';

const report: EodReport = {
  totalSale: 100,
  transactionCount: 4,
  servedSummary: { dine_in: { qty: 3, amount: 70 }, take_away: { qty: 1, amount: 30 } },
  paymentSummary: { CASH: { qty: 3, amount: 60 }, ABA: { qty: 1, amount: 40 } },
  discountSummary: { Promo: { qty: 1, amount: 5 }, Staff: { qty: 1, amount: 2.5 }, 'Total Discount': { qty: 2, amount: 7.5 } },
  categorySummary: { Drinks: { qty: 5, amount: 60 } },
  customerSummary: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`C${i}`, { qty: 1, amount: i + 1 }])),
};

describe('end of day', () => {
  it('queries whole days for the branch', () => {
    expect(eodQuery({ start: '2026-10-01 00:00:00', end: '2026-10-05 23:59:59' }, 'w1')).toBe('startDate=2026-10-01&endDate=2026-10-05+23%3A59%3A59&warehouseId=w1');
    expect(eodQuery({ start: '2026-10-01', end: '2026-10-01' }, '')).not.toContain('warehouseId');
  });
  it('works out the cards like the web', () => {
    expect(averageOrder(report)).toBe(25);
    expect(averageOrder({ totalSale: 5, transactionCount: 0 })).toBe(0);
    expect(totalDiscounts(report.discountSummary)).toBe(7.5);
    expect(totalDiscounts(undefined)).toBe(0);
  });
  it('lists entries in server order, Walk In for dine_in, and the discount types without totals', () => {
    expect(eodEntries(report.servedSummary).map((e) => e.label)).toEqual(['Walk In', 'take_away']);
    expect(discountTypes(report.discountSummary).map((e) => e.key)).toEqual(['Promo', 'Staff']);
  });
  it('shows the top 10 customers by amount', () => {
    const top = topCustomers(report.customerSummary);
    expect(top.total).toBe(12);
    expect(top.rows).toHaveLength(10);
    expect(top.rows[0]).toEqual({ name: 'C11', qty: 1, amount: 12 });
  });
  it('writes lines for share and print', () => {
    const labels: EodLabels = { title: 'End of Day', totalSales: 'Total Sales', transactions: 'Transactions', average: 'Avg', discounts: 'Discounts', payments: 'Payment Methods', served: 'Service Types', categories: 'Category Performance', discountsApplied: 'Discounts Applied', customers: 'Customer Summary' };
    const lines = eodLines(report, (v) => `$${v}`, labels);
    expect(lines[0]).toEqual({ text: 'Total Sales: $100', bold: true });
    expect(lines.some((l) => l.text === 'Walk In (3): $70')).toBe(true);
    expect(lines.some((l) => l.text === 'Total Discount (2): $7.5')).toBe(false);
    expect(eodText('End of Day', lines).startsWith('End of Day\n\nTotal Sales: $100')).toBe(true);
    expect(eodHtml('A<B', lines)).toContain('A&lt;B');
  });
});
