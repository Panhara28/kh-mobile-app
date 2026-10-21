import { canAddCategory, canDeleteCategory, categoryFormOf, categoryProblem, emptyCategoryForm, initials, isReadOnlyField, matches, printerLabel, saleText, saleTone, saveBody, toggleBody, type CategoryItem } from './categories';

const cat: CategoryItem = { id: 'c1', title: 'Food', description: 'Hot', imageUrl: '/f.png', parentId: 'root', printerId: 'p1', sortOrder: 3, excludeFeeDelivery: true, markExtraFee: 0.5, productCount: 10, forSaleCount: 4, printer: { id: 'p1', name: 'Kitchen' } };

describe('the category form', () => {
  it('starts empty and needs a title', () => {
    expect(emptyCategoryForm()).toEqual({ title: '', description: '', imageUrl: '', printerId: '', sortOrder: 0, excludeFeeDelivery: false, markExtraFee: 0 });
    expect(categoryProblem(emptyCategoryForm())).toBe('title');
    expect(categoryProblem({ ...emptyCategoryForm(), title: ' x ' })).toBeNull();
  });
  it('is filled from a category, including the picture and printer', () => {
    expect(categoryFormOf(cat)).toEqual({ title: 'Food', description: 'Hot', imageUrl: '/f.png', printerId: 'p1', sortOrder: 3, excludeFeeDelivery: true, markExtraFee: 0.5 });
    expect(categoryFormOf({ id: 'x', title: 'T', printer: { id: 'pp' } }).printerId).toBe('pp');
  });
  it('sends the whole category, keeping the parent it had, and no id for a new one', () => {
    const f = { ...categoryFormOf(cat), title: ' Food & Drink ', printerId: '' };
    expect(saveBody(f, cat)).toEqual({ id: 'c1', title: 'Food & Drink', description: 'Hot', imageUrl: '/f.png', parentId: 'root', printerId: null, sortOrder: 3, excludeFeeDelivery: true, markExtraFee: 0.5 });
    const created = saveBody({ ...emptyCategoryForm(), title: 'New' });
    expect('id' in created).toBe(false);
    expect(created).toMatchObject({ imageUrl: null, parentId: null, printerId: null, sortOrder: 0, markExtraFee: 0 });
  });
});

describe('permissions in a branch', () => {
  it('only the main branch adds and deletes; other branches can only change the printer', () => {
    expect(canAddCategory(true, true)).toBe(true);
    expect(canAddCategory(false, true)).toBe(false);
    expect(canDeleteCategory(true, false)).toBe(false);
    expect(canDeleteCategory(false, true)).toBe(false);
    expect(isReadOnlyField(false, 'title')).toBe(true);
    expect(isReadOnlyField(false, 'image')).toBe(true);
    expect(isReadOnlyField(true, 'title')).toBe(false);
  });
});

describe('the list', () => {
  it('colours products for sale: all green, none red, some amber', () => {
    expect(saleTone({ forSaleCount: 5, productCount: 5 })).toBe('success');
    expect(saleTone({ forSaleCount: 0, productCount: 5 })).toBe('destructive');
    expect(saleTone({ forSaleCount: 2, productCount: 5 })).toBe('warning');
    expect(saleText(cat)).toBe('4/10');
    expect(saleText({})).toBe('0/0');
  });
  it('searches the title and the description, and builds the for-sale request', () => {
    expect(matches(cat, 'foo')).toBe(true);
    expect(matches(cat, 'HOT')).toBe(true);
    expect(matches(cat, 'zzz')).toBe(false);
    expect(matches(cat, '  ')).toBe(true);
    expect(toggleBody('c1', 'disable')).toEqual({ categoryIds: ['c1'], status: 'disable' });
  });
  it('shows initials and printer names', () => {
    expect(initials('hot drinks bar')).toBe('HDB');
    expect(initials('')).toBe('');
    expect(printerLabel({ id: '1', name: 'Kitchen', printerName: 'Print to K' })).toBe('Kitchen (Print to K)');
    expect(printerLabel({ id: '1', name: 'Kitchen' })).toBe('Kitchen');
  });
});
