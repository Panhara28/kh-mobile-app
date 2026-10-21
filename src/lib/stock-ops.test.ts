import { countBody, countDifference, lotLabel, moveBody, stockInBody, stockOutBody, totalStock, type StockLot } from './stock-ops';

const lots: StockLot[] = [{ lot: { id: 'l1', lotNumber: 'A1', expiredDate: '2027-01-01 00:00:00', costPerUnit: '2.5' }, stock: 10 }, { lot: { id: 'l2' }, stock: 4 }, { lot: null, stock: 1 }];

describe('counting a slot', () => {
  it('sends only the lots that were counted, keeping their details', () => {
    expect(countBody('v1', 's1', lots, { l1: 8, l2: 0 })).toEqual({
      variantId: 'v1',
      slotId: 's1',
      stockLot: [{ lot: { id: 'l1', lotNumber: 'A1', expiredAt: '2027-01-01 00:00:00', costPerUnit: 2.5 }, stock: 8 }, { lot: { id: 'l2' }, stock: 0 }],
    });
  });
  it('ignores negative counts and returns null when nothing was counted', () => {
    expect(countBody('v1', 's1', lots, { l1: -1 })).toBeNull();
    expect(countBody('v1', 's1', lots, {})).toBeNull();
  });
  it('shows the difference and totals', () => {
    expect(countDifference(lots[0]!, 8)).toBe(-2);
    expect(countDifference(lots[0]!, undefined)).toBe(0);
    expect(totalStock(lots)).toBe(15);
    expect(lotLabel(lots[0]!.lot)).toBe('A1 · 2027-01-01');
    expect(lotLabel(null)).toBe('');
  });
});

describe('stock in, out and move', () => {
  it('stock in needs a slot and a quantity, and sends only what was filled', () => {
    expect(stockInBody('v1', 's1', { qty: 5, lotNumber: ' L ', expiredAt: '', cost: 0 })).toEqual({ variantId: 'v1', slotId: 's1', qty: 5, lotNumber: 'L' });
    expect(stockInBody('v1', 's1', { qty: 5, lotNumber: '', expiredAt: '2027-01-01', cost: 3 })).toMatchObject({ expiredAt: '2027-01-01', costPerUnit: 3 });
    expect(stockInBody('v1', '', { qty: 5, lotNumber: '', expiredAt: '', cost: 0 })).toBeNull();
    expect(stockInBody('v1', 's1', { qty: 0, lotNumber: '', expiredAt: '', cost: 0 })).toBeNull();
  });
  it('stock out and move never take more than the slot holds', () => {
    expect(stockOutBody('v1', 's1', 3, 10, 'l1')).toEqual({ variantId: 'v1', slotId: 's1', qty: 3, lotId: 'l1' });
    expect(stockOutBody('v1', 's1', 11, 10)).toBeNull();
    expect(stockOutBody('v1', 's1', 0, 10)).toBeNull();
    expect(moveBody('v1', 's1', 's2', 4, 10)).toEqual({ variantId: 'v1', currentSlotId: 's1', destinationSlotId: 's2', qty: 4 });
    expect(moveBody('v1', 's1', 's1', 4, 10)).toBeNull();
    expect(moveBody('v1', 's1', 's2', 11, 10)).toBeNull();
  });
});
