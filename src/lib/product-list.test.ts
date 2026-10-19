import {
  canManageProducts,
  componentChoices,
  emptySupplierPrice,
  firstPrice,
  hasBranchSwitches,
  labelHtml,
  listQuery,
  needsComponentChoice,
  productImage,
  productIsLow,
  productStock,
  supplierPriceCreateBody,
  supplierPriceForm,
  supplierPriceUpdateBody,
  validateSupplierPrice,
  variantImage,
  variantIsLow,
  variantTitle,
  type ListProduct,
  type ListVariant,
} from './product-list';

const v = (over: Partial<ListVariant> = {}): ListVariant => ({ id: 'v1', name: 'ns', price: 2, stock: 10, lowStockQty: 3, ...over });
const p = (over: Partial<ListProduct> = {}): ListProduct => ({ id: 'p1', title: 'Cola', trackStock: true, productVariants: [v(), v({ id: 'v2', stock: 5, price: 3 })], ...over });

describe('the list query', () => {
  const base = { text: '', barcode: '', supplierId: '', categoryId: '', limit: 30, offset: 60 };
  it('searches by title only from 4 characters, and then starts from the first page', () => {
    expect(listQuery(base)).toBe('limit=30&offset=60');
    expect(listQuery({ ...base, text: 'col' })).toBe('limit=30&offset=60');
    expect(listQuery({ ...base, text: ' cola ' })).toBe('limit=30&offset=0&searchTitle=cola');
  });
  it('filters by supplier, barcode and category', () => {
    expect(listQuery({ ...base, supplierId: 's1', barcode: ' 885 ', categoryId: 'c1' })).toBe('limit=30&offset=60&supplierId=s1&barcode=885&categoryId=c1');
  });
});

describe('what a row shows', () => {
  it('adds up stock, or says N/A for a product with unit conversions', () => {
    expect(productStock(p())).toBe(15);
    expect(productStock(p({ productConversions: [{}] }))).toBeNull();
    expect(firstPrice(p())).toBe(2);
    expect(firstPrice(p({ productVariants: [] }))).toBe(0);
  });
  it('warns of low stock only for a product that tracks stock', () => {
    expect(variantIsLow(v({ stock: 2 }))).toBe(true);
    expect(variantIsLow(v({ stock: 3 }))).toBe(false);
    expect(productIsLow(p({ productVariants: [v({ stock: 1 })] }))).toBe(true);
    expect(productIsLow(p({ trackStock: false, productVariants: [v({ stock: 1 })] }))).toBe(false);
    expect(productIsLow(p())).toBe(false);
  });
  it('names a variant by its option values, and picks pictures', () => {
    expect(variantTitle({ name: 'S / Red', optionValues: [{ id: '1', value: 'S' }, { id: '2', value: 'Red' }] })).toBe('S / Red');
    expect(variantTitle({ name: 'ns' })).toBe('ns');
    const withImages = p({ productImages: [{ url: 'b', imageOrder: 1, productVariantId: 'v1' }, { url: 'a', imageOrder: 0, productVariantId: null }] });
    expect(productImage(withImages)).toBe('a');
    expect(variantImage(withImages, 'v1')).toBe('b');
    expect(variantImage(withImages, 'zz')).toBeNull();
    expect(productImage(p())).toBeNull();
  });
  it('lets only the main branch manage products, and only a following branch switch things', () => {
    expect(canManageProducts(true, true)).toBe(true);
    expect(canManageProducts(false, true)).toBe(false);
    expect(canManageProducts(true, false)).toBe(false);
    expect(hasBranchSwitches({ isMain: false, useMainBranchVisibility: true })).toBe(true);
    expect(hasBranchSwitches({ isMain: true, useMainBranchVisibility: true })).toBe(false);
    expect(hasBranchSwitches({ isMain: false, useMainBranchVisibility: false })).toBe(false);
    expect(hasBranchSwitches(null)).toBe(false);
  });
});

describe('variant actions', () => {
  const composite = v({ isComposite: true, compositeVariants: [{ id: 'c', qty: 2, componentVariant: { id: 'x', name: 'Bag', basicProduct: { title: 'Flour' } } }] });
  it('asks which component to count or stock in for a composite variant', () => {
    expect(needsComponentChoice(composite, 'count')).toBe(true);
    expect(needsComponentChoice(composite, 'stockIn')).toBe(true);
    expect(needsComponentChoice(composite, 'stockOut')).toBe(false);
    expect(needsComponentChoice(v(), 'count')).toBe(false);
    expect(componentChoices(composite)).toEqual([{ variantId: 'x', name: 'Flour (Bag)' }]);
  });
});

describe('supplier prices', () => {
  it('needs a supplier and sensible numbers', () => {
    expect(validateSupplierPrice(emptySupplierPrice())).toBe('supplier');
    expect(validateSupplierPrice({ supplierId: 's', price: -1, scheduledPrice: 0, scheduledAt: '' })).toBe('price');
    expect(validateSupplierPrice({ supplierId: 's', price: 2, scheduledPrice: 0, scheduledAt: '1/1' })).toBe('scheduled');
    expect(validateSupplierPrice({ supplierId: 's', price: 2, scheduledPrice: 3, scheduledAt: '2026-12-01' })).toBeNull();
  });
  it('builds the bodies kh-pos wants', () => {
    expect(supplierPriceCreateBody('v1', { supplierId: 's', price: 2.5, scheduledPrice: 0, scheduledAt: '' })).toEqual([{ supplierId: 's', productVariantId: 'v1', price: 2.5 }]);
    expect(supplierPriceUpdateBody('r1', 'v1', { supplierId: 's', price: 2, scheduledPrice: 3, scheduledAt: '2026-12-01' })).toEqual({ id: 'r1', supplierId: 's', productVariantId: 'v1', price: 2, scheduledAt: '2026-12-01 00:00:00', scheduledPrice: 3 });
    expect('scheduledAt' in supplierPriceUpdateBody('r1', 'v1', { supplierId: 's', price: 2, scheduledPrice: 0, scheduledAt: '' })).toBe(false);
    expect(supplierPriceForm({ price: 4, supplier: { id: 's9' }, scheduledAt: '2026-01-02 00:00:00', scheduledPrice: 5 })).toEqual({ supplierId: 's9', price: 4, scheduledPrice: 5, scheduledAt: '2026-01-02' });
  });
});

describe('the label', () => {
  it('prints the requested number of labels with product, variant, price and barcode, escaping text', () => {
    const html = labelHtml({ title: 'Fish & <Chips>', variant: 'Large', barcode: '885123', price: 2, currency: '$', copies: 3 });
    expect(html.match(/class="label"/g)).toHaveLength(3);
    expect(html).toContain('Fish &amp; &lt;Chips&gt;');
    expect(html).toContain('Large');
    expect(html).toContain('$2.00');
    expect(html).toContain('885123');
  });
  it('hides the default variant name, shows a discounted price, and bounds the copies', () => {
    const html = labelHtml({ title: 'Tea', variant: 'ns', barcode: '', price: 4, discountedPrice: 3, currency: '$', copies: 0 });
    expect(html).not.toContain('class="v"');
    expect(html).toContain('<s>$4.00</s> $3.00');
    expect(html.match(/class="label"/g)).toHaveLength(1);
    expect(labelHtml({ title: 'T', variant: '', barcode: '', price: 1, currency: '$', copies: 999 }).match(/class="label"/g)).toHaveLength(200);
  });
});
