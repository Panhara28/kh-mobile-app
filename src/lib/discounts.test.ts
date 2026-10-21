import {
  allChange,
  appliesBody,
  appliesOn,
  appliesState,
  canLimitVariants,
  categoryChange,
  discountFormOf,
  discountProblem,
  discountSaveBody,
  discountText,
  emptyDiscountForm,
  matchesDiscount,
  productChange,
  tabChangesServer,
  variantToggle,
  type DiscountItem,
} from './discounts';

const d: DiscountItem = { id: 'd1', title: 'Happy hour', description: 'Evenings', discountType: 'PERCENTAGE', value: 15, warehouseId: 'w1' };

describe('the discount form', () => {
  it('starts as a fixed amount and needs a name and a value of at least 1', () => {
    expect(emptyDiscountForm()).toEqual({ title: '', description: '', discountType: 'AMOUNT', value: 0 });
    expect(discountProblem(emptyDiscountForm())).toBe('title');
    expect(discountProblem({ ...emptyDiscountForm(), title: 'x' })).toBe('value');
    expect(discountProblem({ title: 'x', description: '', discountType: 'AMOUNT', value: 250 })).toBeNull();
    expect(discountProblem({ title: 'x', description: '', discountType: 'PERCENTAGE', value: 101 })).toBe('percent');
  });
  it('builds the body: a new id for a new campaign, the same id and branch when editing', () => {
    const f = { ...discountFormOf(d), title: ' Happy hour! ' };
    expect(discountSaveBody(f, 'w9', () => 'new', d)).toEqual({ id: 'd1', title: 'Happy hour!', description: 'Evenings', discountType: 'PERCENTAGE', value: 15, warehouseId: 'w1' });
    expect(discountSaveBody(f, 'w9', () => 'new')).toMatchObject({ id: 'new', warehouseId: 'w9' });
  });
  it('shows the value as the list does', () => {
    expect(discountText({ discountType: 'AMOUNT', value: 5 }, '$')).toBe('$ 5');
    expect(discountText({ discountType: 'PERCENTAGE', value: 10 }, '$')).toBe('10%');
    expect(matchesDiscount(d, 'HAPPY')).toBe(true);
    expect(matchesDiscount(d, 'evening')).toBe(true);
    expect(matchesDiscount(d, 'zzz')).toBe(false);
  });
});

describe('Applies On', () => {
  it('says All Products, Specific Variants, Specific Products or Categories, in that order of priority', () => {
    expect(appliesOn({ applied: [{ is_applied_all: 1 }, { product_id: 'p' }] })).toEqual({ kind: 'all', count: 0 });
    expect(appliesOn({ applied: [{ product_id: 'p', variant_id: 'v1' }, { product_id: 'p', variant_id: 'v2' }] })).toEqual({ kind: 'variants', count: 2 });
    expect(appliesOn({ applied: [{ product_id: 'p' }, { product_id: 'q' }] })).toEqual({ kind: 'products', count: 2 });
    expect(appliesOn({ applied: [{ category_id: 'c' }] })).toEqual({ kind: 'categories', count: 1 });
    expect(appliesOn({})).toEqual({ kind: 'categories', count: 0 });
  });
});

describe('the Applies sheet', () => {
  const rows = [
    { productId: 'p1', variantId: 'v1', product: { id: 'p1', title: 'Cola', images: [{ url: 'u' }] }, productVariants: [{ id: 'v1', name: 'S', price: 1 }, { id: 'v2', name: 'L', price: 2 }] },
    { productId: 'p1', variantId: 'v2', product: { id: 'p1', title: 'Cola', images: [{ url: 'u' }] }, productVariants: [{ id: 'v1', name: 'S', price: 1 }, { id: 'v2', name: 'L', price: 2 }] },
    { productId: 'p2', variantId: null, product: { id: 'p2', title: 'Tea' }, productVariants: [{ id: 't', name: 'ns', price: 1 }] },
    { category: { id: 'c1', title: 'Drinks' } },
  ];
  it('shows one card per product with the variants it is limited to, and picks the first tab like the web', () => {
    const s = appliesState(rows);
    expect(s.products.map((p) => [p.id, p.selected])).toEqual([['p1', ['v1', 'v2']], ['p2', []]]);
    expect(s.products[0]!.image).toBe('u');
    expect(s.categories).toEqual([{ id: 'c1', title: 'Drinks' }]);
    expect(s.tab).toBe('product');
    expect(appliesState([{ isAppliedAll: true }]).tab).toBe('all');
    expect(appliesState([{ category: { id: 'c', title: 'C' } }]).tab).toBe('category');
    expect(appliesState([]).tab).toBe('category');
  });
  it('only asks the server when switching to or from All Products', () => {
    expect(tabChangesServer('product', 'all')).toBe(true);
    expect(tabChangesServer('all', 'category')).toBe(true);
    expect(tabChangesServer('product', 'category')).toBe(false);
    expect(tabChangesServer('all', 'all')).toBe(false);
  });
  it('builds the changes: all, product, category, and ticking variants (the last unticked puts the product back to all variants)', () => {
    expect(allChange('d1', true)).toEqual({ discountId: 'd1', isAppliedAll: true, action: 'insert' });
    expect(allChange('d1', false).action).toBe('delete');
    expect(productChange('d1', 'p1', true)).toEqual({ discountId: 'd1', productId: 'p1', action: 'insert' });
    expect(categoryChange('d1', 'c1', false)).toEqual({ discountId: 'd1', categoryId: 'c1', action: 'delete' });
    expect(variantToggle('d1', { id: 'p1', selected: [] }, 'v1', true)).toEqual([{ discountId: 'd1', productId: 'p1', variantId: 'v1', action: 'insert' }]);
    expect(variantToggle('d1', { id: 'p1', selected: ['v1', 'v2'] }, 'v1', false)).toHaveLength(1);
    expect(variantToggle('d1', { id: 'p1', selected: ['v1'] }, 'v1', false)).toEqual([
      { discountId: 'd1', productId: 'p1', variantId: 'v1', action: 'delete' },
      { discountId: 'd1', productId: 'p1', action: 'insert' },
    ]);
    expect(appliesBody([allChange('d1', true)])).toEqual({ data: [{ discountId: 'd1', isAppliedAll: true, action: 'insert' }] });
    expect(canLimitVariants({ variants: [{ id: 'a', name: 'a', price: 1 }] })).toBe(false);
    expect(canLimitVariants({ variants: [{ id: 'a', name: 'a', price: 1 }, { id: 'b', name: 'b', price: 1 }] })).toBe(true);
  });
});
