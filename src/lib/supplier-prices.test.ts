import { emptyPriceForm, hasFilters, priceCreateBody, priceFormOf, priceImage, priceProblem, priceQuery, priceUpdateBody, productName, scheduledPriceText, type PriceItem } from './supplier-prices';

const row: PriceItem = {
  id: 'r1',
  price: 2.5,
  scheduledPrice: 3,
  scheduledAt: '2026-12-01 00:00:00',
  variant: { id: 'v1', name: 'Bag', basicProduct: { title: 'Flour', images: [{ url: 'a', productVariantId: null }, { url: 'b', productVariantId: 'v1' }] } },
  supplier: { id: 's1', name: 'Acme', contactPhone: '012' },
};

describe('the list query', () => {
  it('always orders by price, and adds only the filters that are set', () => {
    const base = { search: '', supplierId: '', productVariantId: '', order: 'asc' as const, limit: 30, offset: 0 };
    expect(priceQuery(base)).toBe('limit=30&offset=0&orderByPrice=asc');
    expect(priceQuery({ ...base, order: 'desc', search: ' flour ', supplierId: 's1', productVariantId: 'v1', offset: 30 })).toBe('limit=30&offset=30&orderByPrice=desc&search=flour&supplierId=s1&productVariantId=v1');
    expect(hasFilters(base)).toBe(false);
    expect(hasFilters({ ...base, supplierId: 's1' })).toBe(true);
  });
});

describe('a row', () => {
  it('names the product, picks the variant picture and shows the scheduled price', () => {
    expect(productName(row)).toBe('Flour (Bag)');
    expect(productName({})).toBe('?');
    expect(priceImage(row)).toBe('b');
    expect(priceImage({ variant: { id: 'x', basicProduct: { images: [{ url: 'first' }] } } })).toBe('first');
    expect(priceImage({})).toBeNull();
    expect(scheduledPriceText(row, '$')).toBe('$3');
    expect(scheduledPriceText({ scheduledPrice: null }, '$')).toBe('--');
  });
});

describe('the form', () => {
  it('needs a supplier, a product and a price above 0', () => {
    expect(priceProblem(emptyPriceForm())).toBe('supplier');
    expect(priceProblem({ ...emptyPriceForm(), supplierId: 's' })).toBe('product');
    expect(priceProblem({ ...emptyPriceForm(), supplierId: 's', productVariantId: 'v' })).toBe('price');
    expect(priceProblem({ ...emptyPriceForm(), supplierId: 's', productVariantId: 'v', price: 0.01 })).toBeNull();
    expect(priceProblem({ ...emptyPriceForm(), supplierId: 's', productVariantId: 'v', price: 1, scheduledPrice: -1 })).toBe('scheduledPrice');
    expect(priceProblem({ ...emptyPriceForm(), supplierId: 's', productVariantId: 'v', price: 1, scheduledAt: '1/2' })).toBe('scheduledAt');
  });
  it('is filled from a row and builds the create and update bodies', () => {
    const f = priceFormOf(row);
    expect(f).toEqual({ supplierId: 's1', productVariantId: 'v1', productTitle: 'Flour (Bag)', price: 2.5, scheduledPrice: 3, scheduledAt: '2026-12-01' });
    expect(priceCreateBody(f)).toEqual([{ productVariantId: 'v1', supplierId: 's1', price: 2.5 }]);
    expect(priceUpdateBody('r1', f)).toEqual({ id: 'r1', price: 2.5, productVariantId: 'v1', supplierId: 's1', scheduledAt: '2026-12-01', scheduledPrice: 3 });
    expect(priceUpdateBody('r1', { ...f, scheduledAt: '', scheduledPrice: null })).toEqual({ id: 'r1', price: 2.5, productVariantId: 'v1', supplierId: 's1' });
  });
});
