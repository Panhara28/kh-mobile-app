import { componentName, missingLots, productionBody, shortComponents, suggestedQty, validateProduction, type DraftComponent, type ProductionForm } from './production';

const part = (over: Partial<DraftComponent> = {}): DraftComponent => ({ id: 'c1', name: 'Bag', basicProduct: { title: 'Flour' }, availableStock: 20, requiredStock: 10, canProduce: true, stockSlots: [{ slot: { id: 's1' }, lot: { id: 'l1' }, qty: 10 }], ...over });
const form = (over: Partial<ProductionForm> = {}): ProductionForm => ({ variantId: 'v1', qty: 5, slotId: 'out', lotNumber: '', expiredAt: '', cost: 0, ...over });

describe('what can be made', () => {
  it('suggests the smallest batch count the stock covers', () => {
    // asked 5 needs 10 flour (2 per unit) and 20 sugar (4 per unit); have 20 and 30
    const parts = [part({ requiredStock: 10, availableStock: 20 }), part({ id: 'c2', requiredStock: 20, availableStock: 30 })];
    expect(suggestedQty(parts, 5)).toBe(7);
    expect(suggestedQty([], 5)).toBe(0);
    expect(suggestedQty(parts, 0)).toBe(0);
  });
  it('finds components that are short, and slots without a lot', () => {
    expect(shortComponents([part(), part({ id: 'c2', canProduce: false })]).map((c) => c.id)).toEqual(['c2']);
    expect(shortComponents([part({ availableStock: 5 })])).toHaveLength(1);
    expect(missingLots([part()])).toBe(false);
    expect(missingLots([part({ stockSlots: [{ slot: { id: 's' }, qty: 1 }] })])).toBe(true);
    expect(componentName(part())).toBe('Flour (Bag)');
  });
});

describe('making it', () => {
  it('checks the form in order', () => {
    expect(validateProduction(form({ variantId: '' }), [part()], false)).toBe('product');
    expect(validateProduction(form({ qty: 0 }), [part()], false)).toBe('qty');
    expect(validateProduction(form({ slotId: '' }), [part()], false)).toBe('slot');
    expect(validateProduction(form(), [], false)).toBe('parts');
    expect(validateProduction(form(), [part({ canProduce: false })], false)).toBe('short');
    expect(validateProduction(form(), [part({ stockSlots: [{ slot: { id: 's' }, qty: 1 }] })], true)).toBe('lots');
    expect(validateProduction(form(), [part()], true)).toBeNull();
  });
  it('builds the body with the lot details only when filled', () => {
    expect(productionBody(form({ lotNumber: ' L1 ', cost: 2 }), [part()])).toEqual({
      composedVariant: { variantId: 'v1', slotId: 'out', qty: 5, productLot: { lotNumber: 'L1', costPerUnit: 2 } },
      componentVariants: [{ id: 'c1', stockSlots: [{ slotId: 's1', qty: 10 }] }],
    });
    expect(productionBody(form(), [part()]).composedVariant.productLot).toEqual({});
  });
});
