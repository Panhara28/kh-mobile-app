import { canStockIn, movementDirection, movementQuery, oldestFirst, returnsSummary, variantLabel, type ReturnRow } from './stock-activity';

describe('stock activity', () => {
  it('names a variant, leaving out the default "ns"', () => {
    expect(variantLabel({ name: 'Large', basicProduct: { title: 'Rice' } })).toBe('Rice (Large)');
    expect(variantLabel({ name: 'ns', basicProduct: { title: 'Tea' } })).toBe('Tea');
    expect(variantLabel(null)).toBe('');
  });

  it('knows which movements lose stock', () => {
    expect(movementDirection('SALE', 2)).toBe('out');
    expect(movementDirection('TRANSFER_OUT', 2)).toBe('out');
    expect(movementDirection('STOCK_IN', 2)).toBe('in');
    expect(movementDirection('ADJUSTMENT_IN', 1)).toBe('in');
    expect(movementDirection(null, -3)).toBe('out');
  });

  it('builds the movement query', () => {
    expect(movementQuery([], 30, 0)).toBe('limit=30&offset=0');
    expect(movementQuery(['SALE', 'PURCHASE'], 30, 60)).toBe('limit=30&offset=60&status=SALE%2CPURCHASE');
  });

  it('counts returns waiting for stock-in and the money refunded', () => {
    const r = (status: ReturnRow['status'], quantity: number, refundAmount: number): ReturnRow => ({ id: status + quantity, orderId: 'o', orderItemId: 'i', quantity, refundAmount, status });
    const rows = [r('returned', 2, 4.5), r('stock_in', 1, 2.25), r('returned', 1, 1)];
    expect(returnsSummary(rows)).toEqual({ waitingCount: 2, waitingQty: 3, refunded: 7.75 });
    expect(canStockIn(rows[0]!)).toBe(true);
    expect(canStockIn(rows[1]!)).toBe(false);
  });

  it('lists the longest waiting first', () => {
    expect(oldestFirst([{ createdAt: '2026-10-19 10:00:00' }, { createdAt: '2026-10-18 09:00:00' }, { createdAt: null }]).map((r) => r.createdAt)).toEqual([null, '2026-10-18 09:00:00', '2026-10-19 10:00:00']);
  });
});
