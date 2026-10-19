import { canEditStructure, emptyProductForm, formFromDetail, newVariant, priceRange, productBody, validateProduct, type ProductDetail } from './products';

let n = 0;
const id = () => `id${++n}`;

const detail = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  basic: { id: 'p1', title: 'Rice', description: 'Good', weight: 2, supplierId: 's1', trackStock: true, isForSale: true, useProduction: true },
  images: [{ id: 'im1', url: '/a.jpg', imageOrder: 0, productVariantId: 'v1' }, { id: 'im2', url: '/b.jpg', imageOrder: 1 }],
  categories: [{ id: 'pc1', categoryId: 'c1', title: 'Food' }],
  options: [{ id: 'o1', name: 'size', values: [{ id: 'ov1', value: 'Small' }, { id: 'ov2', value: 'Large' }] }],
  variants: [
    { id: 'v1', name: 'Small', barcode: '111', price: 2, purchasePrice: 1, lowStockQty: 3, idealStockQty: 9, optionValues: [{ id: 'ov1', value: 'Small' }], printerId: 'pr1', isPopular: true },
    { id: 'v2', name: 'Large', price: 3, purchasePrice: 1.5, optionValues: [{ id: 'ov2', value: 'Large' }], discountType: 'PERCENTAGE', discountValue: 10, compositeVariants: [] },
  ],
  conversions: [{ fromVariant: { id: 'v2' }, toVariant: { id: 'v1' }, productId: 'p1', conversionRate: 2 }],
  ...over,
});

describe('new product', () => {
  it("starts as kh-pos' simple product: one option \"default\" with one value \"ns\"", () => {
    n = 0;
    const f = emptyProductForm(id);
    expect(f.variants).toHaveLength(1);
    const body = productBody({ ...f, title: ' Tea ', categoryIds: ['c1'] }, null, id);
    expect(body.productBasic).toMatchObject({ title: 'Tea', isForSale: true, trackStock: false, supplierId: null });
    expect(body.productOption).toEqual([{ id: expect.any(String), name: 'default', values: [{ id: f.variants[0]!.optionValueId, value: 'ns' }] }]);
    expect(body.productVariants[0]).toMatchObject({ id: f.variants[0]!.id, name: 'ns', isDefault: true, available: true, price: 0, optionValues: [{ id: f.variants[0]!.optionValueId, value: 'ns' }] });
    expect(body.productCategories).toEqual([{ categoryId: 'c1' }]);
    expect(body.productConversions).toEqual([]);
  });

  it('with several variants makes a "size" option whose values are the variant names', () => {
    n = 0;
    const f = emptyProductForm(id);
    const body = productBody({ ...f, title: 'Coffee', variants: [{ ...f.variants[0]!, name: 'Hot' }, { ...newVariant(id, 'Iced'), price: 2.5 }] }, null, id);
    expect(body.productOption).toHaveLength(1);
    expect(body.productOption[0]).toMatchObject({ name: 'size' });
    expect(body.productOption[0]!.values.map((v) => v.value)).toEqual(['Hot', 'Iced']);
    expect(body.productVariants.map((v) => [v.name, v.isDefault, v.optionValues[0]!.value])).toEqual([['Hot', true, 'Hot'], ['Iced', false, 'Iced']]);
  });
});

describe('editing a product', () => {
  it('fills the form from the detail', () => {
    const f = formFromDetail(detail());
    expect(f).toMatchObject({ title: 'Rice', isForSale: true, trackStock: true, categoryIds: ['c1'], images: ['/a.jpg', '/b.jpg'] });
    expect(f.variants[1]).toMatchObject({ id: 'v2', price: 3, purchasedCost: 1.5, discountType: 'PERCENTAGE', discountValue: 10, optionValueId: 'ov2' });
  });

  it('sends everything back, changing only what was edited', () => {
    const d = detail();
    const f = formFromDetail(d);
    f.variants[0]!.price = 2.5;
    const body = productBody({ ...f, description: 'Better' }, d, id);
    expect(body.productId).toBe('p1');
    expect(body.productBasic).toMatchObject({ description: 'Better', weight: 2, supplierId: 's1', useProduction: true });
    expect(body.productVariants[0]).toMatchObject({ id: 'v1', price: 2.5, barcode: '111', lowStockQty: 3, idealStockQty: 9, printerId: 'pr1', isPopular: true, isDefault: true });
    expect(body.productVariants[1]).toMatchObject({ id: 'v2', price: 3, discountType: 'PERCENTAGE', discountValue: 10, isDefault: false });
    // pictures, categories and conversions keep their ids, so kh-pos keeps them
    expect(body.productImages).toEqual([{ id: 'im1', url: '/a.jpg', imageOrder: 0, productVariantId: 'v1' }, { id: 'im2', url: '/b.jpg', imageOrder: 1 }]);
    expect(body.productCategories).toEqual([{ id: 'pc1', categoryId: 'c1' }]);
    expect(body.productConversions).toEqual([{ fromVariantId: 'v2', toVariantId: 'v1', productId: 'p1', conversionRate: 2 }]);
    expect(body.productOption[0]).toMatchObject({ id: 'o1', name: 'size' });
  });

  it('adds a variant and a picture, and drops a removed one', () => {
    n = 0;
    const d = detail();
    const f = formFromDetail(d);
    f.variants.push({ ...newVariant(id, 'Jumbo'), price: 4 });
    f.images = ['/b.jpg', '/new.jpg'];
    const body = productBody(f, d, id);
    expect(body.productOption[0]!.values.map((v) => v.value)).toEqual(['Small', 'Large', 'Jumbo']);
    expect(body.productVariants.map((v) => v.name)).toEqual(['Small', 'Large', 'Jumbo']);
    expect(body.productImages).toEqual([{ id: 'im2', url: '/b.jpg', imageOrder: 0 }, { url: '/new.jpg', imageOrder: 1 }]);
  });

  it('removing a variant leaves it out (kh-pos then deletes it)', () => {
    const d = detail();
    const f = formFromDetail(d);
    f.variants = [f.variants[1]!];
    const body = productBody(f, d, id);
    expect(body.productVariants.map((v) => v.id)).toEqual(['v2']);
    expect(body.productVariants[0]!.isDefault).toBe(true);
  });

  it('keeps several options and their variants as they were, editing only prices and flags', () => {
    const d = detail({
      options: [
        { id: 'o1', name: 'size', values: [{ id: 'ov1', value: 'Small' }] },
        { id: 'o2', name: 'temp', values: [{ id: 'ov9', value: 'Hot' }] },
      ],
      variants: [{ id: 'v1', name: 'Small / Hot', price: 2, optionValues: [{ id: 'ov1', value: 'Small' }, { id: 'ov9', value: 'Hot' }] }],
    });
    expect(canEditStructure(d)).toBe(false);
    const f = formFromDetail(d);
    f.variants[0] = { ...f.variants[0]!, name: 'IGNORED', price: 5 };
    const body = productBody(f, d, id);
    expect(body.productOption).toEqual(d.options);
    expect(body.productVariants[0]).toMatchObject({ name: 'Small / Hot', price: 5, optionValues: [{ id: 'ov1', value: 'Small' }, { id: 'ov9', value: 'Hot' }] });
  });

  it('turns an empty barcode into null and clears a discount that was switched off', () => {
    const d = detail();
    const f = formFromDetail(d);
    f.variants[0]!.barcode = ' ';
    f.variants[1]!.discountType = '';
    const body = productBody(f, d, id);
    expect(body.productVariants[0]!.barcode).toBeNull();
    expect(body.productVariants[1]).toMatchObject({ discountType: null, discountValue: null });
  });
});

describe('validation', () => {
  const ok = () => ({ ...emptyProductForm(id), title: 'Tea' });
  it('needs a name, a variant name and sensible numbers', () => {
    expect(validateProduct(ok())).toBeNull();
    expect(validateProduct({ ...ok(), title: ' ' })).toBe('title');
    expect(validateProduct({ ...ok(), variants: [] })).toBe('variants');
    const f = ok();
    expect(validateProduct({ ...f, variants: [{ ...f.variants[0]!, name: ' ' }] })).toBe('variantName');
    expect(validateProduct({ ...f, variants: [{ ...f.variants[0]!, price: -1 }] })).toBe('price');
    expect(validateProduct({ ...f, variants: [{ ...f.variants[0]!, discountType: 'PERCENTAGE', discountValue: 150 }] })).toBe('discount');
    expect(validateProduct({ ...f, variants: [{ ...f.variants[0]!, discountType: 'AMOUNT', discountValue: 0 }] })).toBe('discount');
    expect(validateProduct({ ...f, variants: [{ ...f.variants[0]!, name: 'A' }, { ...newVariant(id, 'a') }] })).toBe('duplicateVariant');
  });

  it('shows a price range', () => {
    expect(priceRange([{ price: 2 }, { price: 3.5 }])).toEqual({ min: 2, max: 3.5 });
    expect(priceRange([])).toBeNull();
    expect(priceRange(undefined)).toBeNull();
  });
});
