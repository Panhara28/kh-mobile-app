import { filterOptions, allVerified, compositeQuery, draftQuery, emptyProduction, exceedsStock, historyQuery, isStockSufficient, lotRows, missingLots, produceBlocker, productionBody, rowAmount, slotLine, slotText, suggestedQty, unitRequired, verifyLot, type DraftComponent } from './production';

const part = (over: Partial<DraftComponent> = {}): DraftComponent => ({ id: 'c1', name: 'Bag', basicProduct: { title: 'Flour' }, availableStock: 20, requiredStock: 10, canProduce: true, stockSlots: [{ slot: { id: 's1', name: 'Shelf' }, lot: { id: 'l1', lotNumber: 'L-1' }, qty: 10 }], ...over });
const form = (over = {}) => ({ ...emptyProduction(), variantId: 'v1', cost: 2.5, qty: 5, slotId: 'out', ...over });

describe('queries', () => {
  it('asks for composed products of the branch, like the web picker', () => {
    expect(compositeQuery(' cake ', 'w1', 20)).toBe('limit=20&offset=20&replenishment=false&compositeOnly=true&includeProductNotForSale=false&warehouse=w1&search=cake');
    expect(compositeQuery('', '', 0)).not.toContain('search');
    expect(draftQuery('v 1', 5)).toBe('variantId=v%201&qty=5');
    expect(historyQuery(30)).toBe('offset=30&limit=30&status=COMPOSE_IN');
  });
});

describe('the plan', () => {
  it('suggests the smallest batch count the stock covers', () => {
    // asked 5 needs 10 flour and 20 sugar; have 20 and 30
    const parts = [part({ requiredStock: 10, availableStock: 20 }), part({ id: 'c2', requiredStock: 20, availableStock: 30 })];
    expect(suggestedQty(parts, 5)).toBe(7);
    expect(suggestedQty([], 5)).toBe(0);
    expect(suggestedQty(parts, 0)).toBe(0);
    expect(exceedsStock(parts, 5)).toBe(false);
    expect(exceedsStock([part({ availableStock: 4 })], 5)).toBe(true);
    expect(exceedsStock([], 5)).toBe(false);
  });
  it('flags low stock and works out units per piece', () => {
    expect(isStockSufficient(part())).toBe(true);
    expect(isStockSufficient(part({ availableStock: 9 }))).toBe(false);
    expect(unitRequired(part({ requiredStock: 10 }), 4)).toBe(3);
    expect(unitRequired(part(), 0)).toBe(10);
  });
  it('knows slots without a lot, and what each slot line shows', () => {
    expect(missingLots([part()])).toBe(false);
    expect(missingLots([part({ stockSlots: [{ slot: { id: 's' }, qty: 1 }] })])).toBe(true);
    expect(slotLine({ slot: { name: 'A' }, qty: 1 }, true)).toEqual({ name: 'A', lot: '⚠ Required', missingLot: true });
    expect(slotLine({ slot: { name: 'A' }, qty: 1 }, false)).toEqual({ name: 'A', lot: 'N/A', missingLot: false });
    expect(slotLine({ slot: null, message: 'No stock', qty: 0 }, false).name).toBe('No stock');
    expect(slotLine({ slot: { name: 'A' }, lot: { id: 'l', lotNumber: 'L9' }, qty: 1 }, true)).toMatchObject({ lot: 'L9', missingLot: false });
  });
});

describe('Produce', () => {
  it('is blocked by the same things as on the web', () => {
    const p = [part()];
    expect(produceBlocker(form(), p, true)).toBe('busy');
    expect(produceBlocker(form({ variantId: '' }), p, false)).toBe('product');
    expect(produceBlocker(form({ qty: 0 }), p, false)).toBe('qty');
    expect(produceBlocker(form({ slotId: '' }), p, false)).toBe('slot');
    expect(produceBlocker(form(), [], false)).toBe('parts');
    expect(produceBlocker(form(), [part({ availableStock: 4 })], false)).toBe('exceeds');
    expect(produceBlocker(form(), p, false)).toBeNull();
  });
  it('sends the product price as the cost, and where each component comes from', () => {
    expect(productionBody(form(), [part()])).toEqual({
      composedVariant: { variantId: 'v1', productLot: { costPerUnit: 2.5 }, qty: 5, slotId: 'out' },
      componentVariants: [{ id: 'c1', stockSlots: [{ slotId: 's1', qty: 10 }] }],
    });
  });
});

describe('lot verification', () => {
  const rows = lotRows([part(), part({ id: 'c2', stockSlots: [{ slot: { id: 's2', name: 'B' }, lot: { id: 'l1', lotNumber: 'L-1' }, qty: 1 }, { slot: { id: 's3', name: 'C' }, lot: { id: 'l3', lotNumber: 'L-3' }, qty: 2 }, { slot: { id: 's4' }, qty: 1 }] })]);
  it('lists each lot once and skips slots without one', () => {
    expect(rows.map((r) => r.lotId)).toEqual(['l1', 'l3']);
    expect(rows[0]).toMatchObject({ title: 'Flour', slot: 'Shelf', qty: 10 });
  });
  it('checks scanned ids one by one until all are verified', () => {
    expect(verifyLot('  ', rows, []).result).toBe('empty');
    expect(verifyLot('zzz', rows, []).result).toBe('missing');
    const a = verifyLot('l1', rows, []);
    expect(a).toEqual({ result: 'verified', verified: ['l1'] });
    expect(verifyLot('l1', rows, a.verified).result).toBe('already');
    expect(allVerified(rows, a.verified)).toBe(false);
    expect(allVerified(rows, ['l1', 'l3'])).toBe(true);
    expect(allVerified([], [])).toBe(false);
  });
});

describe('recent production rows', () => {
  it('shows cost per unit times quantity and the slot with POS marker', () => {
    expect(rowAmount({ id: 'x', qty: 4, productLot: { costPerUnit: '2.5' } })).toBe(10);
    expect(rowAmount({ id: 'x', qty: 4 })).toBe(0);
    expect(slotText({ id: 'x', qty: 1, slot: { name: 'Front', posSlot: 1 } })).toBe('Front (POS)');
    expect(slotText({ id: 'x', qty: 1 })).toBe('');
  });
});

describe('filterOptions', () => {
  const rows = [
    { variantId: '1', productTitle: 'Tiger Beer (Can)', sku: 'TB-01', barcode: '885' },
    { variantId: '2', productTitle: 'Angkor Beer (Bottle)', sku: 'AB-02', barcode: '886' },
  ];
  it('finds by title, SKU or barcode, every word', () => {
    expect(filterOptions(rows, 'beer').map((r) => r.variantId)).toEqual(['1', '2']);
    expect(filterOptions(rows, 'tiger can').map((r) => r.variantId)).toEqual(['1']);
    expect(filterOptions(rows, 'ab-02').map((r) => r.variantId)).toEqual(['2']);
    expect(filterOptions(rows, '885').map((r) => r.variantId)).toEqual(['1']);
    expect(filterOptions(rows, 'zzz')).toEqual([]);
    expect(filterOptions(rows, '  ')).toBe(rows);
  });
});
