import { itemLines, itemsQuery, itemsSummary } from './sale-items';

const items = [
  { description: 'Cola', qty: 3, discount_amount: 1, total_amount: 7.5 },
  { description: 'Tea', qty: 2, discount_amount: 0.5, total_amount: 4 },
];

describe('sale item report', () => {
  it('queries whole days', () => {
    expect(itemsQuery({ start: '2026-10-01 00:00:00', end: '2026-10-05 23:59:59' })).toBe('startDate=2026-10-01&endDate=2026-10-05+23%3A59%3A59');
  });
  it('sums the cards', () => {
    expect(itemsSummary(items)).toEqual({ totalItems: 2, totalQty: 5, totalDiscount: 1.5, totalRevenue: 11.5 });
    expect(itemsSummary([])).toEqual({ totalItems: 0, totalQty: 0, totalDiscount: 0, totalRevenue: 0 });
  });
  it('numbers the lines and ends with the grand total', () => {
    const lines = itemLines(items, (v) => `$${v}`, 'Grand Total');
    expect(lines[0]!.text).toBe('1. Cola  x3  $7.5');
    expect(lines.at(-1)).toEqual({ text: 'Grand Total  x5  $11.5', bold: true });
  });
});
