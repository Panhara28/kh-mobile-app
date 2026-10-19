import { slimGroup, deleteSteps, groupListQuery, heldLabel, pickedLabel, saveSteps, assignBody, emptyGroup, groupBody, groupForm, notInGroup, productLabel, validateGroup, warehouseChanges, type GroupRow } from './product-groups';

const g: GroupRow = { groupId: 'g1', groupName: 'Drinks', description: null, warehouses: [{ warehouseId: 'w1' }], products: [{ productId: 'p1', productVariantId: 'v1', product: { title: 'Cola' }, variant: { name: '330ml' } }] };

describe('product groups', () => {
  it('needs a name', () => {
    expect(validateGroup(emptyGroup())).toBe('name');
    expect(validateGroup({ name: ' x ', description: '' })).toBeNull();
  });
  it('builds the body with the id, trimmed text and no empty description', () => {
    expect(groupBody({ name: ' Drinks ', description: ' ' }, 'g1')).toEqual({ groupId: 'g1', groupName: 'Drinks', description: undefined });
    expect(groupBody(groupForm({ ...g, description: 'Cold' }), 'g1').description).toBe('Cold');
  });
  it('labels products and finds what is not yet in the group', () => {
    expect(productLabel(g.products[0]!)).toBe('Cola (330ml)');
    expect(productLabel({ productId: 'p', productVariantId: 'v', variant: { name: 'ns' }, product: { title: 'Tea' } })).toBe('Tea');
    expect(notInGroup(g, 'v1')).toBe(false);
    expect(notInGroup(g, 'v2')).toBe(true);
  });
  it('works out which branches to add and remove', () => {
    expect(warehouseChanges(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
    expect(warehouseChanges([], [])).toEqual({ add: [], remove: [] });
  });
  it('sends products as productId and productVariantId', () => {
    expect(assignBody([{ productId: 'p', variantId: 'v' }])).toEqual([{ productId: 'p', productVariantId: 'v' }]);
  });
});

describe('the web save sequence', () => {
  const form = { name: 'Drinks', description: '' };
  const cola = { productId: 'p1', variantId: 'v1', label: 'Cola' };
  const tea = { productId: 'p2', variantId: 'v2', label: 'Tea' };
  const last = (s: { method: string; path: string }) => `${s.method} ${s.path.split('/').slice(-1)[0]}`;
  it('queries 20 per page for a branch', () => {
    expect(groupListQuery(20, '')).toBe('offset=20&limit=20');
    expect(groupListQuery(0, 'w1')).toBe('offset=0&limit=20&warehouseIds=w1');
  });
  it('labels products as the web does', () => {
    expect(heldLabel({ productId: 'p', productVariantId: 'v', product: { title: 'Cola' }, variant: { name: '330', barcode: '123' } })).toBe('Cola (330) (123)');
    expect(heldLabel({ productId: 'p', productVariantId: 'v', variant: { sku: 7 } })).toBe('7');
    expect(pickedLabel('Cola', 'C1')).toBe('Cola (C1)');
    expect(pickedLabel('Cola', null)).toBe('Cola');
  });
  it('creates: group, products, branches, then visibility', () => {
    const steps = saveSteps({ id: 'g9', existing: null, form, products: [cola], warehouseIds: ['w1', 'w2'] });
    expect(steps.map(last)).toEqual(['POST group', 'POST products', 'POST warehouse', 'POST warehouse-visibilty']);
    expect((steps[3]!.body as { input: unknown[] }).input).toEqual([
      { warehouseId: 'w1', productId: 'p1', productVariantId: 'v1', isVisible: true, isForSale: true },
      { warehouseId: 'w2', productId: 'p1', productVariantId: 'v1', isVisible: true, isForSale: true },
    ]);
    expect(saveSteps({ id: 'g9', existing: null, form, products: [], warehouseIds: [] })).toHaveLength(1);
  });
  it('edits: shows added products in the chosen branches, hides removed ones, then branch changes', () => {
    const existing: GroupRow = { ...g, products: [{ productId: 'p1', productVariantId: 'v1' }], warehouses: [{ warehouseId: 'w1' }] };
    const steps = saveSteps({ id: 'g1', existing, form, products: [tea], warehouseIds: ['w2'] });
    expect(steps.map(last)).toEqual(['PUT group', 'POST products', 'POST warehouse-visibilty', 'DELETE products', 'DELETE warehouse-visibilty', 'POST warehouse', 'POST warehouse-visibilty', 'DELETE warehouse', 'DELETE warehouse-visibilty']);
    expect(steps[2]!.body).toEqual({ input: [{ warehouseId: 'w2', productId: 'p2', productVariantId: 'v2', isVisible: true, isForSale: true }] });
    expect(steps[4]!.body).toEqual({ input: [{ warehouseId: 'w2', productId: 'p1', productVariantId: 'v1' }] });
    expect(steps[8]!.body).toEqual({ input: [{ warehouseId: 'w1', productId: 'p2', productVariantId: 'v2' }] });
    expect(saveSteps({ id: 'g1', existing, form, products: [{ productId: 'p1', variantId: 'v1', label: '' }], warehouseIds: ['w1'] })).toHaveLength(1);
  });
  it('deletes the group, then hides its products in its branches', () => {
    const steps = deleteSteps({ ...g, products: [{ productId: 'p1', productVariantId: 'v1' }], warehouses: [{ warehouseId: 'w1' }, { warehouseId: 'w2' }] });
    expect(steps).toHaveLength(2);
    expect(steps[0]!.body).toEqual({ groupId: 'g1' });
    expect((steps[1]!.body as { input: unknown[] }).input).toHaveLength(2);
    expect(deleteSteps({ ...g, products: [], warehouses: [] })).toHaveLength(1);
  });
});

describe('slimGroup', () => {
  it('keeps only the creator name, never the login token', () => {
    const raw = { ...g, createdBy: { fullname: 'Dev', token: 'secret', username: 'dev' } } as unknown as GroupRow;
    expect(slimGroup(raw).createdBy).toEqual({ fullname: 'Dev' });
    expect(JSON.stringify(slimGroup(raw))).not.toContain('secret');
    expect(slimGroup({ ...g, createdBy: null }).createdBy).toBeNull();
  });
});
