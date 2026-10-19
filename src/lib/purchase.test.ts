import { createPoBody, poQuery, poTotals, receiveBody, remaining, statusBody, statusTone, validatePo, type PoDetail, type PoItem } from './purchase';

let n = 0;
const id = () => `id${++n}`;

describe('making a purchase order', () => {
  const lines = [{ variantId: 'v1', name: 'Rice (Bag)', qty: 3, cost: 12.5 }, { variantId: 'v2', name: 'Oil', qty: 2, cost: 4 }];

  it('adds up the items and the extra costs', () => {
    expect(poTotals(lines, [{ name: 'Delivery', cost: 5 }, { name: '', cost: 0 }])).toEqual({ items: 45.5, extra: 5, total: 50.5 });
    expect(poTotals([], [])).toEqual({ items: 0, extra: 0, total: 0 });
  });

  it('needs a supplier and sensible lines', () => {
    expect(validatePo({ supplierId: 's1', lines })).toBeNull();
    expect(validatePo({ supplierId: '', lines })).toBe('supplier');
    expect(validatePo({ supplierId: 's1', lines: [] })).toBe('lines');
    expect(validatePo({ supplierId: 's1', lines: [{ ...lines[0]!, qty: 0 }] })).toBe('qty');
    expect(validatePo({ supplierId: 's1', lines: [{ ...lines[0]!, cost: -1 }] })).toBe('cost');
  });

  it('builds the draft kh-pos wants, with each line total and string costs', () => {
    n = 0;
    const body = createPoBody({ supplierId: 's1', warehouseId: 'w1', purchasedAt: '2026-10-19 09:00:00', expectedAt: null, note: '  rush ', lines, extras: [{ name: ' Delivery ', cost: 5 }, { name: ' ', cost: 9 }] }, id);
    expect(body).toMatchObject({ supplierId: 's1', status: 'draft', warehouseId: 'w1', expectedAt: null, note: 'rush' });
    expect(body.items[0]).toEqual({ id: 'id1', name: 'Rice (Bag)', stock: null, qty: 3, amount: 37.5, receivedQty: 0, purchaseCost: '12.5', productVariantId: 'v1' });
    expect(body.additionalCosts).toEqual([{ id: 'id3', name: 'Delivery', cost: '5' }]);
  });
});

describe('approving and receiving', () => {
  const item = (over: Partial<PoItem> = {}): PoItem => ({ id: 'd1', name: 'Rice', qty: 10, amount: 100, receivedQty: 4, purchaseCost: '10', productVariantId: 'v1', ...over });
  const detail: PoDetail = { id: 'po1', supplierId: 's1', status: 'draft', warehouseId: 'w1', purchasedAt: '2026-10-19 09:00:00', expectedAt: null, note: null, items: [item({ status: 'pending' })], additionalCosts: [{ id: 'c1', name: 'Delivery', cost: '5' }] };

  it('sends the order back as it is with the new status', () => {
    const body = statusBody(detail, 'approved');
    expect(body).toMatchObject({ id: 'po1', status: 'approved', supplierId: 's1', note: null });
    expect(body.items[0]).toEqual({ id: 'd1', name: 'Rice', stock: null, qty: 10, amount: 100, receivedQty: 4, purchaseCost: '10', productVariantId: 'v1', status: 'pending' });
    expect(body.additionalCosts).toEqual([{ id: 'c1', name: 'Delivery', cost: '5' }]);
  });

  it('knows what is still to come', () => {
    expect(remaining(item())).toBe(6);
    expect(remaining(item({ receivedQty: 12 }))).toBe(0);
    expect(remaining({ qty: null, receivedQty: null })).toBe(0);
  });

  it('receives only what is chosen, never more than remains, each into a slot', () => {
    const items = [item(), item({ id: 'd2', qty: 5, receivedQty: 0, purchaseCost: '2' }), item({ id: 'd3' })];
    const body = receiveBody('po1', items, { d1: { qty: 99, slotId: 's1', lotNumber: ' L1 ', expiredAt: '2027-01-01' }, d2: { qty: 3, slotId: '' }, d3: { qty: 0, slotId: 's1' } });
    expect(body).toEqual({ purchaseOrderId: 'po1', receivedItems: [{ purchaseOrderDetailId: 'd1', slotId: 's1', qty: 6, costPerUnit: 10, lotNumber: 'L1', expiredAt: '2027-01-01' }] });
    expect(receiveBody('po1', items, {})).toBeNull();
  });

  it('colours the status and builds the list query', () => {
    expect([statusTone('completed'), statusTone('approved'), statusTone('draft'), statusTone('deleted'), statusTone('closed')]).toEqual(['success', 'info', 'outline', 'destructive', 'default']);
    expect(poQuery({ limit: 30, offset: 0 })).toBe('limit=30&offset=0');
    expect(poQuery({ status: 'draft', supplierId: 's1', limit: 10, offset: 20 })).toBe('limit=10&offset=20&status=draft&supplierId=s1');
  });
});
