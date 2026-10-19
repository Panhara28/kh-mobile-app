import { suggestedLines, createRepBody, itemName, receiveBody, remaining, repQuery, repTone, repTotals, validateRep, type RepItem } from './replenishment';

const item = (over: Partial<RepItem> = {}): RepItem => ({ id: 'd1', sentQty: 10, cost: 2, receivedQty: 4, ...over });
const lines = [{ variantId: 'v1', name: 'Rice', sentQty: 3, cost: 1.5 }, { variantId: 'v2', name: 'Oil', sentQty: 2, cost: 4 }];

describe('sending stock to another branch', () => {
  it('adds up quantity and cost', () => {
    expect(repTotals(lines)).toEqual({ qty: 5, cost: 12.5 });
    expect(repTotals([])).toEqual({ qty: 0, cost: 0 });
  });

  it('needs another branch and sensible lines', () => {
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'b', lines })).toBeNull();
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: '', lines })).toBe('to');
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'a', lines })).toBe('same');
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'b', lines: [] })).toBe('lines');
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'b', lines: [{ ...lines[0]!, sentQty: 0 }] })).toBe('qty');
  });

  it('builds the body kh-pos wants', () => {
    expect(createRepBody({ fromWarehouseId: 'a', toWarehouseId: 'b', lines })).toEqual({
      fromWarehouseId: 'a',
      toWarehouseId: 'b',
      status: 'draft',
      replenishmentDetails: [{ variantId: 'v1', sentQty: 3, costPerUnit: 1.5 }, { variantId: 'v2', sentQty: 2, costPerUnit: 4 }],
    });
    expect(createRepBody({ fromWarehouseId: 'a', toWarehouseId: 'b', lines }, 'approved').status).toBe('approved');
  });
});

describe('receiving', () => {
  it('knows what is still to come', () => {
    expect(remaining(item())).toBe(6);
    expect(remaining(item({ receivedQty: 12 }))).toBe(0);
  });

  it('receives only chosen items with a slot, never more than remains', () => {
    const items = [item(), item({ id: 'd2', receivedQty: 0, cost: 3 }), item({ id: 'd3' }), item({ id: 'd4', receivedQty: 10 })];
    const body = receiveBody('r1', items, { d1: { qty: 99, slotId: 's1', lotNumber: ' L ', expiredAt: '2027-01-01' }, d2: { qty: 3, slotId: '' }, d3: { qty: 0, slotId: 's1' }, d4: { qty: 1, slotId: 's1' } });
    expect(body).toEqual({ replenishmentId: 'r1', receivedItems: [{ replenishmentDetailId: 'd1', slotId: 's1', qty: 6, costPerUnit: 2, lotNumber: 'L', expiredAt: '2027-01-01' }] });
    expect(receiveBody('r1', items, {})).toBeNull();
  });
});

describe('display helpers', () => {
  it('names an item and colours the status', () => {
    expect(itemName(item({ productVariant: { basicProduct: { title: 'Rice' }, name: 'Bag' } }))).toBe('Rice (Bag)');
    expect(itemName(item({ productVariant: { basicProduct: { title: 'Rice' }, name: 'ns' } }))).toBe('Rice');
    expect(itemName(item())).toBe('?');
    expect([repTone('received'), repTone('approved'), repTone('receiving'), repTone('draft'), repTone('deleted')]).toEqual(['success', 'info', 'warning', 'outline', 'destructive']);
  });

  it('builds the list query', () => {
    expect(repQuery({ limit: 30, offset: 0 })).toBe('limit=30&offset=0');
    expect(repQuery({ status: 'draft', limit: 10, offset: 20 })).toBe('limit=10&offset=20&status=draft');
  });
});

describe('suggestions', () => {
  const s = (over = {}) => ({ id: 'v1', name: 'Bag', basicProduct: { title: 'Flour' }, stock: 2, sourceStock: 50, lowStockQty: 5, idealStockQty: 20, purchasedCost: 1.5, ...over });
  it('tops up to the ideal level, limited by what this branch has', () => {
    expect(suggestedLines([s()])).toEqual([{ variantId: 'v1', name: 'Flour (Bag)', sentQty: 18, cost: 1.5 }]);
    expect(suggestedLines([s({ sourceStock: 4 })])[0]!.sentQty).toBe(4);
  });
  it('uses the low level when no ideal is set and skips what cannot be sent', () => {
    expect(suggestedLines([s({ idealStockQty: null })])[0]!.sentQty).toBe(3);
    expect(suggestedLines([s({ sourceStock: 0 }), s({ stock: 30 })])).toEqual([]);
  });
});
