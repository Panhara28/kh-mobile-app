import { assignBody, emptyGroup, groupBody, groupForm, notInGroup, productLabel, validateGroup, warehouseChanges, type GroupRow } from './product-groups';

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
