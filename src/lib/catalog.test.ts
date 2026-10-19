import { categoryBody, categoryForm, discountBody, discountForm, emptyDiscount, fetchAllPages, modifierBody, parentOptions, parseModifierItems, supplierBody, supplierForm, validateDiscount, type CategoryRow, type ModifierRow } from './catalog';

describe('paging', () => {
  it('reads every page until the total is reached', async () => {
    const all = Array.from({ length: 230 }, (_, i) => i);
    const calls: number[] = [];
    const rows = await fetchAllPages(async (offset, limit) => {
      calls.push(offset);
      return { data: all.slice(offset, offset + limit), total: all.length };
    });
    expect(rows).toHaveLength(230);
    expect(calls).toEqual([0, 100, 200]);
  });
  it('stops on an empty page, and on a short one', async () => {
    expect(await fetchAllPages(async () => ({ data: [], total: 999 }))).toEqual([]);
    expect(await fetchAllPages(async () => ({ data: [1, 2], total: 999 }))).toEqual([1, 2]);
  });
});

describe('categories', () => {
  const row: CategoryRow = { id: 'c1', title: 'Food', description: null, imageUrl: '/img.png', parentId: null, printerId: 'p1', sortOrder: 2, excludeFeeDelivery: true, markExtraFee: 0.5 };
  it('round-trips a category and keeps its picture', () => {
    const f = categoryForm(row);
    expect(f).toMatchObject({ title: 'Food', description: '', parentId: '', printerId: 'p1', sortOrder: 2, excludeFeeDelivery: true, markExtraFee: 0.5 });
    expect(categoryBody({ ...f, title: ' Food ', parentId: '' }, row)).toEqual({
      id: 'c1',
      title: 'Food',
      description: '',
      imageUrl: '/img.png',
      parentId: null,
      printerId: 'p1',
      sortOrder: 2,
      excludeFeeDelivery: true,
      markExtraFee: 0.5,
    });
  });
  it('a new category has no id and no picture', () => {
    const body = categoryBody(categoryForm({ id: 'x', title: 'T' }));
    expect(body).not.toHaveProperty('id');
    expect(body.imageUrl).toBeNull();
  });
  it('offers every category except itself as a parent', () => {
    expect(parentOptions([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'a', 'None')).toEqual([
      { value: '', label: 'None' },
      { value: 'b', label: 'B' },
    ]);
  });
});

describe('modifiers', () => {
  it('reads options from lines', () => {
    expect(parseModifierItems('Egg = 0.5\n  Cheese=1,5 \n\nPlain\nBad = abc\n = 3\nNeg = -2')).toEqual([
      { name: 'Egg', price: 0.5 },
      { name: 'Cheese', price: 15 },
      { name: 'Plain', price: 0 },
      { name: 'Bad', price: 0 },
      { name: 'Neg', price: 0 },
    ]);
  });
  it('sends every option with an id: the old one when the name is the same, a new one otherwise', () => {
    const existing: ModifierRow = { modifierId: 'm1', title: 'Add-ons', items: [{ id: 'i1', name: 'Egg', price: 0.5 }] };
    let n = 0;
    const body = modifierBody({ title: ' Add-ons ', description: '', items: 'egg = 0.75\nBacon = 1' }, () => `new${++n}`, existing);
    expect(body).toEqual({ id: 'm1', title: 'Add-ons', description: '', items: [{ id: 'i1', name: 'egg', price: 0.75 }, { id: 'new1', name: 'Bacon', price: 1 }] });
  });
});

describe('discounts', () => {
  it('needs a title and a sensible value', () => {
    const f = { ...emptyDiscount(), title: '10% off', value: 10 };
    expect(validateDiscount(f)).toBeNull();
    expect(validateDiscount({ ...f, title: ' ' })).toBe('title');
    expect(validateDiscount({ ...f, value: 0 })).toBe('value');
    expect(validateDiscount({ ...f, value: 120 })).toBe('value');
    expect(validateDiscount({ ...f, discountType: 'AMOUNT', value: 120 })).toBeNull();
  });
  it('makes an id and uses the branch for a new discount, and keeps both when editing', () => {
    const f = { ...emptyDiscount(), title: 'Happy', value: 5, discountType: 'AMOUNT' };
    expect(discountBody(f, 'w1', () => 'd1')).toEqual({ id: 'd1', title: 'Happy', description: '', discountType: 'AMOUNT', value: 5, warehouseId: 'w1' });
    const row = { id: 'd9', title: 'x', discountType: 'PERCENTAGE' as const, value: 1, warehouseId: 'w2' };
    expect(discountBody(discountForm(row), 'w1', () => 'zzz', row)).toMatchObject({ id: 'd9', warehouseId: 'w2' });
  });
});

describe('suppliers', () => {
  it('round-trips', () => {
    const f = supplierForm({ id: 's1', name: 'Acme', contactPhone: '012', isConsignment: 1 });
    expect(f).toMatchObject({ name: 'Acme', contactPhone: '012', contactName: '', isConsignment: true });
    expect(supplierBody({ ...f, name: ' Acme ' }, { id: 's1', name: 'Acme' })).toMatchObject({ id: 's1', name: 'Acme', isConsignment: true });
  });
});
