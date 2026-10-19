import {
  addConversion,
  addImages,
  applyOptions,
  bindable,
  canGenerate,
  conversionComplete,
  conversionsLeft,
  createBody,
  defaultMovie,
  formFromDetail,
  fromChoices,
  generateVariants,
  imagesFor,
  isMovie,
  matchVariant,
  MOVIE_CATEGORY_ID,
  newProductForm,
  optionProblems,
  patchConversion,
  patchVariant,
  removeComponent,
  removeVariant,
  setAllPrices,
  setCategory,
  setComponent,
  setDiscountType,
  toChoices,
  toggleBind,
  updateBody,
  validateProduct,
  type Detail,
  type OptionForm,
  type ProductFormData,
} from './product-form';

let k = 0;
const id = () => `id${++k}`;
const fresh = () => {
  k = 0;
  return newProductForm(id);
};
const withTitle = (f: ProductFormData, title = 'Cola') => ({ ...f, title });

const opt = (name: string, values: string[]): OptionForm => ({ id: id(), name, values: values.map((v) => ({ id: id(), value: v })) });

describe('a new product', () => {
  it('starts like the web: option "default" with "ns" and one default variant', () => {
    const f = fresh();
    expect(f.options).toHaveLength(1);
    expect(f.options[0]).toMatchObject({ name: 'default', values: [{ value: 'ns' }] });
    expect(f.variants).toHaveLength(1);
    expect(f.variants[0]).toMatchObject({ name: 'ns', isDefault: true, visible: true, price: 0, printerId: null, isComposite: false });
    expect(f).toMatchObject({ isForSale: false, trackStock: false, supplierId: '', categoryId: '' });
  });
});

describe('options and variants', () => {
  it('generates every combination named "A / B"', () => {
    const v = generateVariants([opt('Size', ['S', 'L']), opt('Color', ['Red', 'Blue'])]);
    expect(v.map((x) => x.name)).toEqual(['S / Red', 'S / Blue', 'L / Red', 'L / Blue']);
    expect(v[0]!.optionValues.map((o) => o.value)).toEqual(['S', 'Red']);
    expect(generateVariants([])).toEqual([]);
    expect(generateVariants([opt('Size', [])])).toEqual([]);
  });

  it('checks the options like the dialog: name, duplicate name, at least one value', () => {
    expect(optionProblems([opt('', ['a']), opt('Size', []), opt('Size', ['x'])])).toEqual([
      { index: 0, kind: 'name' },
      { index: 1, kind: 'duplicate' },
      { index: 1, kind: 'values' },
      { index: 2, kind: 'duplicate' },
    ]);
    expect(canGenerate([opt('Size', ['S'])])).toBe(true);
    expect(canGenerate([opt('', ['S'])])).toBe(false);
    expect(canGenerate([opt('Size', [])])).toBe(false);
  });

  it('matches an old variant by name, or by the same parts reversed', () => {
    const f = fresh();
    const old = [{ ...f.variants[0]!, name: 'Red / S' }];
    expect(matchVariant('Red / S', old)).toBe(old[0]);
    expect(matchVariant('S / Red', old)).toBe(old[0]);
    expect(matchVariant('S / Blue', old)).toBeUndefined();
  });

  it('applying options keeps the price, barcode and settings of a variant that remains and gives new ones the category printer', () => {
    let f = fresh();
    f = patchVariant(f, 0, { name: 'S', price: 3, barcode: '123', lowStockQty: 2, isPopular: true, isDefault: true });
    const opts = [opt('Size', ['S', 'L'])];
    const next = applyOptions(f, opts, id, 'printerA');
    expect(next.variants.map((v) => v.name)).toEqual(['S', 'L']);
    expect(next.variants[0]).toMatchObject({ id: f.variants[0]!.id, price: 3, barcode: '123', lowStockQty: 2, isPopular: true, isDefault: true });
    expect(next.variants[1]).toMatchObject({ price: 0, printerId: 'printerA', isDefault: false });
    expect(next.options[0]!.name).toBe('Size');
  });

  it('applying options makes the first variant the default when none remains, and frees pictures and conversions of removed variants', () => {
    let f = fresh();
    f = { ...f, images: [{ id: 'i1', url: 'u', productVariantId: f.variants[0]!.id }], conversions: [{ fromVariantId: f.variants[0]!.id, toVariantId: 'zz', conversionRate: 2 }] };
    const next = applyOptions(f, [opt('Size', ['M'])], id, null);
    expect(next.variants[0]!.isDefault).toBe(true);
    expect(next.images[0]!.productVariantId).toBe('');
    expect(next.conversions).toEqual([]);
  });

  it('sets one price for all variants, and a discount type switched off clears its value', () => {
    let f = applyOptions(fresh(), [opt('Size', ['S', 'L'])], id, null);
    f = setAllPrices(f, 2.5);
    expect(f.variants.map((v) => v.price)).toEqual([2.5, 2.5]);
    f = patchVariant(f, 0, { discountType: 'PERCENTAGE', discountValue: 10 });
    expect(setDiscountType(f, 0, '').variants[0]).toMatchObject({ discountType: '', discountValue: null });
    expect(setDiscountType(f, 0, 'AMOUNT').variants[0]).toMatchObject({ discountType: 'AMOUNT', discountValue: 10 });
  });

  it('a category gives every variant its kitchen printer', () => {
    const f = applyOptions(fresh(), [opt('Size', ['S', 'L'])], id, null);
    const next = setCategory(f, 'cat1', 'pr1');
    expect(next.categoryId).toBe('cat1');
    expect(next.variants.every((v) => v.printerId === 'pr1')).toBe(true);
    expect(setCategory(next, 'cat2', undefined).variants.every((v) => v.printerId === null)).toBe(true);
    expect(setCategory(next, '', 'x').variants.every((v) => v.printerId === 'pr1')).toBe(true);
  });

  it('removing a variant frees its pictures and drops its conversions', () => {
    let f = applyOptions(fresh(), [opt('Size', ['S', 'L'])], id, null);
    const [a, b] = f.variants;
    f = { ...f, images: [{ id: 'i1', url: 'u', productVariantId: b!.id }], conversions: [{ fromVariantId: a!.id, toVariantId: b!.id, conversionRate: 2 }] };
    const next = removeVariant(f, 1);
    expect(next.variants).toHaveLength(1);
    expect(next.images[0]!.productVariantId).toBe('');
    expect(next.conversions).toEqual([]);
  });
});

describe('composite components', () => {
  it('adds a component, then changes its quantity, never below 1, and removes it', () => {
    let f = fresh();
    f = patchVariant(f, 0, { isComposite: true });
    f = setComponent(f, 0, { variantId: 'v9', quantity: 1, title: 'Sugar (kg)' });
    f = setComponent(f, 0, { variantId: 'v9', quantity: 3 });
    expect(f.variants[0]!.compositeVariants).toEqual([{ variantId: 'v9', quantity: 3, title: 'Sugar (kg)' }]);
    f = setComponent(f, 0, { variantId: 'v9', quantity: 0 });
    expect(f.variants[0]!.compositeVariants[0]!.quantity).toBe(1);
    expect(removeComponent(f, 0, 0).variants[0]!.compositeVariants).toEqual([]);
  });
});

describe('pictures', () => {
  it('binds up to two pictures to a variant, only free ones, and unbinds on a second tap', () => {
    let f = fresh();
    const vid = f.variants[0]!.id;
    f = addImages(f, ['a', 'b', 'c'], id);
    const [a, b, c] = f.images;
    f = toggleBind(f, a!.id, vid);
    f = toggleBind(f, b!.id, vid);
    f = toggleBind(f, c!.id, vid); // a third is refused
    expect(imagesFor(f, vid).map((x) => x.url)).toEqual(['a', 'b']);
    expect(bindable(f, vid).map((x) => x.url)).toEqual(['a', 'b', 'c']);
    f = toggleBind(f, a!.id, vid);
    expect(imagesFor(f, vid).map((x) => x.url)).toEqual(['b']);
    // a picture bound to another variant cannot be taken
    expect(toggleBind(f, b!.id, 'other')).toBe(f);
  });
});

describe('conversions', () => {
  const two = () => applyOptions(fresh(), [opt('Unit', ['Box', 'Piece'])], id, null);

  it('allows one conversion between two variants, in either direction, and not the same twice', () => {
    let f = two();
    expect(conversionsLeft(f)).toBe(2);
    f = addConversion(f);
    const [box, piece] = f.variants;
    f = patchConversion(f, 0, { fromVariantId: box!.id, toVariantId: piece!.id, conversionRate: 12 });
    expect(conversionComplete(f.conversions[0]!)).toBe(true);
    expect(conversionsLeft(f)).toBe(0);
    expect(toChoices(f, 0).map((v) => v.name)).toEqual(['Piece']);
    expect(fromChoices(f, 0).map((v) => v.name)).toEqual(['Box']);
  });

  it('needs two different variants and a rate of at least 2', () => {
    expect(conversionComplete({ fromVariantId: 'a', toVariantId: 'a', conversionRate: 2 })).toBe(false);
    expect(conversionComplete({ fromVariantId: 'a', toVariantId: 'b', conversionRate: 1 })).toBe(false);
    expect(conversionComplete({ fromVariantId: '', toVariantId: 'b', conversionRate: 5 })).toBe(false);
    expect(toChoices(addConversion(two()), 0)).toEqual([]);
  });
});

describe('checking before saving', () => {
  it('needs a title and at least one variant', () => {
    expect(validateProduct(fresh())).toEqual({ field: 'title' });
    expect(validateProduct(withTitle(fresh()))).toBeNull();
    expect(validateProduct({ ...withTitle(fresh()), variants: [] })).toEqual({ field: 'variants' });
  });

  it('checks each variant: name, duplicates, numbers, discount, composite', () => {
    let f = withTitle(applyOptions(fresh(), [opt('Size', ['S', 'L'])], id, null));
    expect(validateProduct(patchVariant(f, 1, { name: ' ' }))).toEqual({ field: 'variantName', index: 1 });
    expect(validateProduct(patchVariant(f, 1, { name: 's' }))).toEqual({ field: 'duplicateVariant', index: 1 });
    expect(validateProduct(patchVariant(f, 0, { price: -1 }))).toEqual({ field: 'price', index: 0 });
    expect(validateProduct(patchVariant(f, 0, { purchasedCost: -1 }))).toEqual({ field: 'cost', index: 0 });
    expect(validateProduct(patchVariant(f, 0, { lowStockQty: -2 }))).toEqual({ field: 'stock', index: 0 });
    expect(validateProduct(patchVariant(f, 0, { discountType: 'AMOUNT', discountValue: 0 }))).toEqual({ field: 'discount', index: 0 });
    expect(validateProduct(patchVariant(f, 0, { discountType: 'PERCENTAGE', discountValue: 101 }))).toEqual({ field: 'discount', index: 0 });
    expect(validateProduct(patchVariant(f, 0, { discountType: 'PERCENTAGE', discountValue: 10 }))).toBeNull();
    f = patchVariant(f, 0, { isComposite: true });
    expect(validateProduct(f)).toEqual({ field: 'composite', index: 0 });
    expect(validateProduct(setComponent(f, 0, { variantId: 'x', quantity: 1 }))).toBeNull();
  });

  it('refuses an unfinished conversion', () => {
    expect(validateProduct(addConversion(withTitle(applyOptions(fresh(), [opt('U', ['A', 'B'])], id, null))))).toEqual({ field: 'conversion', index: 0 });
  });

  it('a movie has one variant, a duration and a producer share from 0 to 100', () => {
    let f = setCategory(withTitle(fresh()), MOVIE_CATEGORY_ID, null);
    expect(isMovie(f)).toBe(true);
    f = { ...f, movie: { ...defaultMovie(f, '2026-10-20'), durationMinutes: 0 } };
    expect(validateProduct(f)).toEqual({ field: 'movieDuration' });
    f = { ...f, movie: { ...f.movie!, durationMinutes: 120, producerShare: 120 } };
    expect(validateProduct(f)).toEqual({ field: 'moviePercent' });
    f = { ...f, movie: { ...f.movie!, producerShare: 40 } };
    expect(validateProduct(f)).toBeNull();
    const two = { ...f, variants: [...f.variants, { ...f.variants[0]!, id: 'other', name: 'x' }] };
    expect(validateProduct(two)).toEqual({ field: 'movieVariants' });
  });
});

describe('the request bodies', () => {
  const detail: Detail = {
    basic: { id: 'p1', title: 'Cola', description: 'Cold', weight: 1, length: 2, width: 3, height: 4, isComposite: false, useProduction: true, trackStock: true, isForSale: true, supplierId: 's1' },
    images: [{ id: 'im2', url: 'b', imageOrder: 1, productVariantId: 'v1' }, { id: 'im1', url: 'a', imageOrder: 0, productVariantId: null }],
    categories: [{ id: 'row1', categoryId: 'cat1', title: 'Drinks' }],
    options: [{ id: 'o1', name: 'Size', values: [{ id: 'ov1', value: 'S' }, { id: 'ov2', value: 'L' }] }],
    variants: [
      { id: 'v1', name: 'S', barcode: '111', price: 1.5, purchasePrice: 1, lowStockQty: 5, idealStockQty: 20, discountType: 'PERCENTAGE', discountValue: 10, optionValues: [{ id: 'ov1', value: 'S' }], available: true, isDefault: true, isComposite: false, visible: true, isPopular: true, isNew: false, isMostOrder: false, printerId: 'pr1' },
      { id: 'v2', name: 'L', barcode: null, price: 2, purchasePrice: 1.4, optionValues: [{ id: 'ov2', value: 'L' }], isComposite: true, compositeVariants: [{ id: 'c1', qty: 2, componentVariant: { id: 'x1', name: 'Bag', basicProduct: { title: 'Flour', images: [{ url: 'f.jpg', productVariantId: 'x1' }] } } }] },
    ],
    conversions: [{ fromVariant: { id: 'v2' }, toVariant: { id: 'v1' }, productId: 'p1', conversionRate: 6 }],
  };

  it('fills the form from the detail with every field', () => {
    const f = formFromDetail(detail);
    expect(f).toMatchObject({ productId: 'p1', title: 'Cola', supplierId: 's1', categoryId: 'cat1', isForSale: true, trackStock: true, useProduction: true, weight: 1 });
    expect(f.images.map((i) => i.url)).toEqual(['a', 'b']);
    expect(f.options[0]!.values.every((v) => v.locked)).toBe(true);
    expect(f.variants[0]).toMatchObject({ barcode: '111', purchasedCost: 1, lowStockQty: 5, idealStockQty: 20, discountType: 'PERCENTAGE', discountValue: 10, printerId: 'pr1', isPopular: true });
    expect(f.variants[1]!.compositeVariants).toEqual([{ id: 'c1', variantId: 'x1', quantity: 2, title: 'Flour (Bag)', image: 'f.jpg' }]);
    expect(f.conversions).toEqual([{ fromVariantId: 'v2', toVariantId: 'v1', conversionRate: 6 }]);
  });

  it('an edit sends the whole product back, changing only what was edited', () => {
    let f = formFromDetail(detail);
    f = patchVariant(f, 0, { price: 1.75 });
    const body = updateBody(f);
    expect(body.productId).toBe('p1');
    expect(body.productBasic).toMatchObject({ title: 'Cola', description: 'Cold', weight: 1, useProduction: true, supplierId: 's1', trackStock: true, isForSale: true });
    expect(body.productCategories).toEqual([{ id: 'row1', categoryId: 'cat1' }]);
    expect(body.productImages).toEqual([{ url: 'a', id: 'im1', imageOrder: 0, productVariantId: '' }, { url: 'b', id: 'im2', imageOrder: 1, productVariantId: 'v1' }]);
    expect(body.productOption).toEqual([{ id: 'o1', name: 'Size', values: [{ id: 'ov1', value: 'S' }, { id: 'ov2', value: 'L' }] }]);
    expect(body.productVariants[0]).toMatchObject({ id: 'v1', price: 1.75, barcode: '111', lowStockQty: 5, idealStockQty: 20, purchasedCost: 1, discountType: 'PERCENTAGE', discountValue: 10, printerId: 'pr1', isDefault: true });
    expect(body.productVariants[1]).toMatchObject({ barcode: null, isComposite: true, compositeVariants: [{ id: 'c1', variantId: 'x1', quantity: 2 }], discountType: null, discountValue: null });
    expect(body.productConversions).toEqual([{ fromVariantId: 'v2', toVariantId: 'v1', productId: 'p1', conversionRate: 6 }]);
  });

  it('a changed category is sent without the old row id', () => {
    const f = setCategory(formFromDetail(detail), 'cat2', 'pr2');
    expect(updateBody(f).productCategories).toEqual([{ categoryId: 'cat2' }]);
    expect(updateBody(setCategory(f, '', null)).productCategories).toEqual([]);
  });

  it('a new product is created with its ids, picture order and nulls for empty barcode and supplier', () => {
    let f = withTitle(fresh(), ' Fanta ');
    f = addImages(f, ['u1', 'u2'], id);
    const body = createBody(f);
    expect(body.productBasic).toMatchObject({ title: 'Fanta', supplierId: null, isForSale: false, trackStock: false });
    expect(body.productImages.map((i) => i.imageOrder)).toEqual([0, 1]);
    expect(body.productVariants[0]).toMatchObject({ name: 'ns', barcode: null, discountType: null, discountValue: null, compositeVariants: [], printerId: null });
    expect(body.productCategories).toEqual([]);
    expect('productMovies' in body).toBe(false);
  });

  it('a movie product sends its movie data against the first variant', () => {
    let f = setCategory(withTitle(fresh(), 'Film'), MOVIE_CATEGORY_ID, null);
    f = { ...f, movie: { ...defaultMovie(f, '2026-10-20'), durationMinutes: 100 } };
    const body = createBody(f);
    expect(body.productMovies).toMatchObject({ variantId: f.variants[0]!.id, durationMinutes: 100, rating: 'G', releaseDate: '2026-10-20' });
    // a normal product never sends movie data
    expect('productMovies' in createBody({ ...f, categoryId: 'other' })).toBe(false);
  });
});
