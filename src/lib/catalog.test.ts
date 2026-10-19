import { discountBody, discountForm, emptyDiscount, fetchAllPages, supplierBody, supplierForm, validateDiscount } from './catalog';

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
