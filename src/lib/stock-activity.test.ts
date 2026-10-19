import { returnCode, returnHistory, returnImage, returnProduct, returnsQuery, MOVEMENT_TYPES, canStockIn, movementAmount, movementDate, movementQty, movementSlot, rowTypeKey, movementDirection, movementQuery, oldestFirst, returnsSummary, variantLabel, type ReturnRow } from './stock-activity';

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

describe('transactions page rows', () => {
  it('lists the same 16 filters as the web', () => {
    expect(MOVEMENT_TYPES).toHaveLength(16);
    expect(MOVEMENT_TYPES).toContain('COMPOSE_IN');
    expect(MOVEMENT_TYPES).toContain('CONVERSION_OUT');
  });
  it('shows quantity, amount, slot and date like the web', () => {
    expect(movementQty({ transactionType: 'SALE', qty: -3 })).toBe(3);
    expect(movementQty({ transactionType: 'STOCK_OUT', qty: -3 })).toBe(-3);
    expect(movementAmount({ transactionType: 'SALE', qty: -3, productLot: { costPerUnit: '2.5' } })).toEqual({ negative: false, value: 7.5 });
    expect(movementAmount({ transactionType: 'STOCK_OUT', qty: -2, productLot: { costPerUnit: 4 } })).toEqual({ negative: true, value: 8 });
    expect(movementAmount({ transactionType: 'STOCK_IN', qty: 2 })).toEqual({ negative: false, value: 0 });
    expect(movementSlot({ id: 'x', transactionType: null, qty: 1, slot: { name: 'POS', posSlot: 1 } })).toBe('POS (POS)');
    expect(rowTypeKey('REPLENISHMENT_OUT')).toBe('REPLENISHMENT');
    expect(rowTypeKey('SALE')).toBe('SALE');
    expect(movementDate('2026-04-25T19:03:20')).toBe('Apr 25, 2026');
    expect(movementDate(null)).toBe('');
  });
});

describe('order return page', () => {
  it('builds the tab query and the RTN code', () => {
    expect(returnsQuery('returned', 0)).toBe('offset=0&limit=30&status=returned');
    expect(returnsQuery('stock_in', 30)).toBe('offset=30&limit=30&status=stock_in');
    expect(returnCode(1)).toBe('RTN-00001');
    expect(returnCode(123)).toBe('RTN-00123');
  });
  it('shows the product, its picture and the history', () => {
    const r = { productVariant: { id: 'v', name: '1kg', basicProduct: { title: 'Rice', images: [{ url: 'a', productVariantId: 'x' }, { url: 'b', productVariantId: 'v' }] } } };
    expect(returnProduct(r)).toBe('Rice (1kg)');
    expect(returnImage(r)).toBe('b');
    expect(returnImage({})).toBeNull();
    expect(returnHistory({ returnedAt: '2026-10-01 10:00', returnedBy: { fullname: 'A' }, stockInAt: '2026-10-02 09:00', stockInBy: { fullname: 'B' } })).toEqual([
      { kind: 'returned', at: '2026-10-01 10:00', by: 'A' },
      { kind: 'stock_in', at: '2026-10-02 09:00', by: 'B' },
    ]);
    expect(returnHistory({ returnedAt: '2026-10-01 10:00' })).toHaveLength(1);
    expect(returnHistory({})).toEqual([]);
  });
});
