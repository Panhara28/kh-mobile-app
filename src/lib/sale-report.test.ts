import { activeFilterCount, chartCaption, chartItems, exportCsv, exportName, fmt, saleQuery, showOrderedAt, toggleId, type SaleFilters, type SaleRow } from './sale-report';

const base: SaleFilters = { startDate: '2026-10-01', endDate: '2026-10-05', warehouseIds: [], userIds: [], categoryIds: [], productId: '', groupBy: 'product' };
const detail = (name: string, over: Partial<SaleRow> = {}): SaleRow => ({ type: 'detail', name, totalQty: 1, supplyPrice: 1, totalPrice: 5, modifier: 0, discount: 0, revenue: 5, profit: 4, ...over });

describe('query and filters', () => {
  it('builds the web query and leaves empty filters out', () => {
    expect(saleQuery(base)).toBe('startDate=2026-10-01&endDate=2026-10-05+23%3A59%3A59&groupBy=product');
    expect(saleQuery({ ...base, warehouseIds: ['w1', 'w2'], userIds: ['u1'], categoryIds: ['c1', 'c2'], productId: 'p1', groupBy: 'time' })).toBe(
      'startDate=2026-10-01&endDate=2026-10-05+23%3A59%3A59&warehouseId=w1%2Cw2&groupBy=time&userIds=u1&categoryIds=c1%2Cc2&productId=p1',
    );
  });
  it('counts active filters like the web', () => {
    expect(activeFilterCount(base, true)).toBe(2);
    expect(activeFilterCount({ ...base, warehouseIds: ['w1'], userIds: ['u'], productId: 'p', categoryIds: ['c'] }, true)).toBe(6);
    expect(activeFilterCount({ ...base, warehouseIds: ['w1'] }, false)).toBe(2);
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('table and chart', () => {
  it('shows the ordered-at column only when rows have it, and formats numbers', () => {
    expect(showOrderedAt([detail('a')])).toBe(false);
    expect(showOrderedAt([detail('a', { orderedAt: '2026-10-01 10:00' })])).toBe(true);
    expect(fmt(1234.5)).toBe('1,234.50');
    expect(fmt(NaN)).toBe('0.00');
  });
  it('adds detail rows by name, drops zero values and sorts biggest first', () => {
    const rows: SaleRow[] = [{ ...detail('Total'), type: 'total' }, detail('Cola - 330ml', { revenue: 10, totalQty: 2, profit: 6 }), detail('Cola - 330ml', { revenue: 5, totalQty: 1, profit: 3 }), detail('Tea', { revenue: 12, totalQty: 1, profit: 0 }), detail('Free', { revenue: 0, totalQty: 1, profit: -1 })];
    const rev = chartItems(rows, 'revenue');
    expect(rev.map((i) => [i.name, i.value])).toEqual([['Cola', 15], ['Tea', 12]]);
    expect(rev[0]!.fullName).toBe('Cola - 330ml');
    expect(chartItems(rows, 'qty').map((i) => [i.name, i.value])).toEqual([['Cola', 3], ['Tea', 1], ['Free', 1]]);
    expect(chartItems(rows, 'profit').map((i) => i.name)).toEqual(['Cola']);
    expect(chartCaption(20, 'profit')).toBe('Showing top 20 products by profit');
    expect(chartCaption(7, 'qty')).toBe('Showing 7 products by qty');
  });
  it('keeps ties at the 30th place', () => {
    const rows = Array.from({ length: 33 }, (_, i) => detail(`P${i}`, { revenue: i < 29 ? 100 - i : 50 }));
    expect(chartItems(rows, 'revenue')).toHaveLength(33 - 0);
    expect(chartItems(Array.from({ length: 40 }, (_, i) => detail(`P${i}`, { revenue: 100 - i })), 'revenue')).toHaveLength(30);
  });
});

describe('export', () => {
  it('writes the web columns', () => {
    const rows: SaleRow[] = [{ type: 'total', totalQty: 3, supplyPrice: 4, totalPrice: 15, modifier: 0, discount: 1, revenue: 14, profit: 10 }, { type: 'category', name: 'Category: Drinks', totalQty: 3, supplyPrice: 4, totalPrice: 15, modifier: 0, discount: 1, revenue: 14, profit: 10 }, detail('Cola, "big"', { productCode: 'C1', orderedAt: '2026-10-01 10:00' })];
    const grouped = exportCsv(rows, true).split('\n');
    expect(grouped[0]).toBe('Type,Product Code,Product Name,Quantity,Supply Price,Total Price,Modifier,Discount,Revenue,Profit');
    expect(grouped[1]).toBe('GRAND TOTAL,,,3,4.00,15.00,0.00,1.00,14.00,10.00');
    expect(grouped[2]!.startsWith('Category Summary,,Category: Drinks')).toBe(true);
    expect(grouped[3]).toBe('Detail,C1,"Cola, ""big""",1,1.00,5.00,0.00,0.00,5.00,4.00');
    const timed = exportCsv(rows, false).split('\n');
    expect(timed[0]).toContain('Ordered At');
    expect(timed[3]).toContain('2026-10-01 10:00');
    expect(exportName('2026-10-01', '2026-10-05')).toBe('Sale-Breakdown-Report-2026-10-01-to-2026-10-05');
  });
});
