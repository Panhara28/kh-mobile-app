import { addExtra, addProduct, applyToAll, cancelRemainingBody, categorize, emptyPoForm, formFromDetail, formTotals, initialReceive, orderedBy, progressPercent, receiveProblem, receiveRequest, receivedSummary, receivedText, removeExtra, removeItem, rowActions, saveBody, setExtra, setItem, sortForReceive, validateForm, visibleItems, createPoBody, poQuery, poTotals, receiveBody, remaining, statusBody, statusTone, validatePo, type PoDetail, type PoItem } from './purchase';

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

describe('purchase order list and details', () => {
  it('says how much was received', () => {
    expect(receivedText({ received: 3, totalQty: 10 })).toBe('Receiving 3 of 10');
    expect(receivedText({ received: 10, totalQty: 10 })).toBe('Received 10 of 10');
    expect(receivedText({ received: 0, totalQty: 10 })).toBe('0 of 10');
    expect(receivedText({ totalQty: 4 })).toBe('0 of 4');
  });
  it('offers the web row menu', () => {
    expect(rowActions('draft')).toEqual(['open', 'edit', 'delete']);
    expect(rowActions('approved')).toEqual(['open', 'receive', 'edit', 'delete']);
    expect(rowActions('completed')).toEqual(['open']);
    expect(rowActions('closed')).toEqual(['open', 'edit', 'delete']);
  });
  it('works out progress, what was received and the owner', () => {
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(20, 10)).toBe(100);
    expect(progressPercent(null, null)).toBe(0);
    const d = { items: [{ id: 'a', name: 'A', qty: 4, receivedQty: 2, purchaseCost: '10', amount: 40, productVariantId: 'v' }], additionalCosts: [{ id: 'c', name: 'Ship', cost: '5' }], total: '45' } as unknown as PoDetail;
    expect(receivedSummary(d)).toEqual({ received: 25, remaining: 20 });
    expect(receivedSummary({ ...d, total: '20' })).toEqual({ received: 25, remaining: 0 });
    expect(orderedBy({ createdBy: { id: 'u1', username: 'dara' } }, 'u1')).toBe('Owner');
    expect(orderedBy({ createdBy: { id: 'u2', username: 'dara' } }, 'u1')).toBe('dara');
  });
});

describe('the create and edit form', () => {
  let k = 0;
  const nid = () => `n${++k}`;
  const cola = { variantId: 'v1', name: 'Cola', sku: 100, stock: 7, purchasedCost: 1.5 };
  it('adds a product with its stock and purchase cost, and refuses the same one twice', () => {
    const a = addProduct(emptyPoForm('2026-10-20'), cola, nid);
    expect(a.duplicate).toBe(false);
    expect(a.form.items[0]).toMatchObject({ name: 'Cola', stock: 7, purchaseCost: '1.5', qty: null, amount: 0 });
    expect(a.form.items[0]!.status).toBeUndefined();
    expect(addProduct(a.form, cola, nid).duplicate).toBe(true);
    expect(addProduct(a.form, { ...cola, variantId: 'v9' }, nid).duplicate).toBe(true);
    expect(addProduct(a.form, { variantId: 'v2', name: 'Tea', sku: 200 }, nid).duplicate).toBe(false);
    const edit = addProduct({ ...emptyPoForm('2026-10-20'), id: 'po1' }, cola, nid);
    expect(edit.form.items[0]!.status).toBe('to_create');
  });
  it('recalculates the line amount and the totals', () => {
    let f = addProduct(emptyPoForm('2026-10-20'), cola, nid).form;
    const id = f.items[0]!.id;
    f = setItem(f, id, { qty: 4 });
    expect(f.items[0]!.amount).toBe(6);
    f = setItem(f, id, { purchaseCost: '2' });
    expect(f.items[0]!.amount).toBe(8);
    f = addExtra(f, nid);
    const ex = f.extras[0]!.id;
    f = setExtra(f, ex, { name: 'Ship', cost: '3' });
    expect(formTotals(f)).toEqual({ items: 8, extra: 3, total: 11 });
  });
  it('drops items in a new order but marks them to_delete in a saved one', () => {
    const f = addProduct(emptyPoForm('2026-10-20'), cola, nid).form;
    expect(removeItem(f, f.items[0]!.id).items).toHaveLength(0);
    const saved = { ...f, id: 'po1' };
    const marked = removeItem(saved, f.items[0]!.id);
    expect(marked.items[0]!.status).toBe('to_delete');
    expect(visibleItems(marked)).toHaveLength(0);
    const withExtra = addExtra(saved, nid);
    expect(withExtra.extras[0]!.status).toBe('to_create');
    expect(removeExtra(withExtra, withExtra.extras[0]!.id).extras[0]!.status).toBe('to_delete');
    expect(removeExtra(addExtra(f, nid), 'x').extras).toHaveLength(1);
  });
  it('checks the form in the web order', () => {
    let f = emptyPoForm('2026-10-20');
    expect(validateForm(f)).toEqual({ kind: 'supplier' });
    f = { ...f, supplierId: 's1' };
    expect(validateForm(f)).toEqual({ kind: 'items' });
    f = addProduct(f, cola, nid).form;
    expect(validateForm(f)).toEqual({ kind: 'qty', name: 'Cola' });
    f = setItem(f, f.items[0]!.id, { qty: 2 });
    expect(validateForm(f)).toBeNull();
    f = setExtra(addExtra(f, nid), f.extras[0]?.id ?? 'x', {});
    expect(validateForm(f)).toEqual({ kind: 'extra', name: '' });
  });
  it('builds the body: a new order is a draft, an edit keeps its status', () => {
    let f = { ...emptyPoForm('2026-10-20'), supplierId: 's1', note: 'n', expectedAt: '2026-10-25' };
    f = setItem(addProduct(f, cola, nid).form, 'x', {});
    f = setItem(f, f.items[0]!.id, { qty: 2 });
    const b = saveBody(f, 'w1');
    expect(b).toMatchObject({ supplierId: 's1', status: 'draft', warehouseId: 'w1', purchasedAt: '2026-10-20', expectedAt: '2026-10-25', note: 'n' });
    expect('id' in b).toBe(false);
    expect(b.items[0]).toMatchObject({ qty: 2, amount: 3, purchaseCost: '1.5', productVariantId: 'v1', stock: 7 });
    const e = saveBody({ ...f, id: 'po1', status: 'approved', expectedAt: '' }, 'w1');
    expect(e).toMatchObject({ id: 'po1', status: 'approved', expectedAt: null });
  });
  it('loads an order for editing', () => {
    const d = { id: 'po1', supplierId: 's1', status: 'approved', warehouseId: 'w1', purchasedAt: '2026-10-01 00:00:00', expectedAt: null, note: null, items: [{ id: 'i1', name: 'Rice', sku: 5, stock: 3, qty: 4, amount: 40, receivedQty: 1, purchaseCost: '10', productVariantId: 'v', status: 'pending' }], additionalCosts: [{ id: 'c1', name: 'Ship', cost: '5' }] } as unknown as PoDetail;
    const f = formFromDetail(d);
    expect(f).toMatchObject({ id: 'po1', status: 'approved', purchasedAt: '2026-10-01', expectedAt: '', note: '' });
    expect(f.items[0]).toMatchObject({ name: 'Rice', qty: 4, purchaseCost: '10', status: 'pending' });
    expect(f.extras[0]).toMatchObject({ name: 'Ship', cost: '5' });
  });
});

describe('receiving like the web', () => {
  const items = [
    { id: 'a', name: 'Apple', qty: 10, receivedQty: 0, purchaseCost: '2', amount: 20, productVariantId: 'v1' },
    { id: 'b', name: 'Banana', qty: 10, receivedQty: 4, purchaseCost: '3', amount: 30, productVariantId: 'v2' },
    { id: 'c', name: 'Cherry', qty: 5, receivedQty: 5, purchaseCost: '4', amount: 20, productVariantId: 'v3' },
  ] as PoItem[];
  it('groups and sorts items', () => {
    const c = categorize(items);
    expect([c.pending.length, c.partial.length, c.completed.length]).toEqual([1, 1, 1]);
    expect(sortForReceive(items, 'desc').map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(sortForReceive([...items].reverse(), null).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(sortForReceive([items[1]!, { ...items[0]!, name: 'Zed', id: 'z' }], 'asc').map((i) => i.id)).toEqual(['z', 'b']);
  });
  it('picks what to receive by mode', () => {
    expect(initialReceive(items, 'full')).toMatchObject({ selected: ['a', 'b'], rows: { a: { qty: 10, costPerUnit: 2 }, b: { qty: 6, costPerUnit: 3 } } });
    expect(initialReceive(items, 'partial').rows.a!.qty).toBe(5);
    expect(initialReceive(items, 'partial').rows.b!.qty).toBe(3);
    expect(initialReceive(items, 'custom').selected).toEqual([]);
    expect(initialReceive(items, 'custom').rows.c).toBeUndefined();
  });
  it('checks the selected items', () => {
    const { rows } = initialReceive(items, 'full');
    expect(receiveProblem(['a'], rows, items)).toBe('Apple: Slot is required');
    const withSlot = applyToAll(rows, { slotId: 's1', slotName: 'POS', expiredAt: '2027-01-01' });
    expect(receiveProblem(['a', 'b'], withSlot, items)).toBeNull();
    expect(receiveProblem(['a'], { a: { ...withSlot.a!, qty: 11 } }, items)).toBe('Apple: Quantity exceeds available (10)');
    expect(receiveProblem(['a'], { a: { ...withSlot.a!, qty: 0 } }, items)).toBe('Apple: Quantity must be greater than 0');
  });
  it('sends only the selected items with their date, lot and cost', () => {
    const withSlot = applyToAll(initialReceive(items, 'full').rows, { slotId: 's1', expiredAt: '2027-01-01' });
    withSlot.a = { ...withSlot.a!, lotNumber: 'L1' };
    expect(receiveRequest('po1', ['a'], withSlot)).toEqual({ purchaseOrderId: 'po1', receivedItems: [{ purchaseOrderDetailId: 'a', slotId: 's1', qty: 10, costPerUnit: 2, expiredAt: '2027-01-01', lotNumber: 'L1' }] });
  });
  it('cancels the remaining items by completing the order', () => {
    const d = { id: 'po1', supplierId: 's', status: 'approved', warehouseId: 'w', purchasedAt: '2026-10-01', expectedAt: null, note: null, items: [{ id: 'a', name: 'A', qty: 1, amount: 1, receivedQty: 0, purchaseCost: '1', productVariantId: 'v' }], additionalCosts: [] } as unknown as PoDetail;
    const b = cancelRemainingBody(d);
    expect(b.status).toBe('completed');
    expect(b.items[0]!.status).toBe('cancelled');
  });
});
