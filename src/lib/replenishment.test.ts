import { selectableIds, suggestBody, suggestProblem, suggestRows, suggestTotals, toStockIn, webSendQty, addRepLine, approvalBlockedByLots, emptyRepForm, lotRowsOf, otherBranch, pickingFor, removeRepLine, repActions, repCode, repFilters, repFormFrom, repFormProblem, repFormTotals, repInfo, repListQuery, repSaveBody, setRepLine, type RepDetail, isVerified, matchLotNumber, pickBody, pickName, pickProgress, verifiable, type PickRow, suggestedLines, createRepBody, itemName, receiveBody, remaining, repQuery, repTone, repTotals, validateRep, type RepItem } from './replenishment';

const item = (over: Partial<RepItem> = {}): RepItem => ({ id: 'd1', sentQty: 10, cost: 2, receivedQty: 4, ...over });
const lines = [{ variantId: 'v1', name: 'Rice', sentQty: 3, cost: 1.5 }, { variantId: 'v2', name: 'Oil', sentQty: 2, cost: 4 }];

describe('sending stock to another branch', () => {
  it('adds up quantity and cost', () => {
    expect(repTotals(lines)).toEqual({ qty: 5, cost: 12.5 });
    expect(repTotals([])).toEqual({ qty: 0, cost: 0 });
  });

  it('needs another branch and sensible lines', () => {
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'b', lines })).toBeNull();
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: '', lines })).toBe('to');
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'a', lines })).toBe('same');
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'b', lines: [] })).toBe('lines');
    expect(validateRep({ fromWarehouseId: 'a', toWarehouseId: 'b', lines: [{ ...lines[0]!, sentQty: 0 }] })).toBe('qty');
  });

  it('builds the body kh-pos wants', () => {
    expect(createRepBody({ fromWarehouseId: 'a', toWarehouseId: 'b', lines })).toEqual({
      fromWarehouseId: 'a',
      toWarehouseId: 'b',
      status: 'draft',
      replenishmentDetails: [{ variantId: 'v1', sentQty: 3, costPerUnit: 1.5 }, { variantId: 'v2', sentQty: 2, costPerUnit: 4 }],
    });
    expect(createRepBody({ fromWarehouseId: 'a', toWarehouseId: 'b', lines }, 'approved').status).toBe('approved');
  });
});

describe('receiving', () => {
  it('knows what is still to come', () => {
    expect(remaining(item())).toBe(6);
    expect(remaining(item({ receivedQty: 12 }))).toBe(0);
  });

  it('receives only chosen items with a slot, never more than remains', () => {
    const items = [item(), item({ id: 'd2', receivedQty: 0, cost: 3 }), item({ id: 'd3' }), item({ id: 'd4', receivedQty: 10 })];
    const body = receiveBody('r1', items, { d1: { qty: 99, slotId: 's1', lotNumber: ' L ', expiredAt: '2027-01-01' }, d2: { qty: 3, slotId: '' }, d3: { qty: 0, slotId: 's1' }, d4: { qty: 1, slotId: 's1' } });
    expect(body).toEqual({ replenishmentId: 'r1', receivedItems: [{ replenishmentDetailId: 'd1', slotId: 's1', qty: 6, costPerUnit: 2, lotNumber: 'L', expiredAt: '2027-01-01' }] });
    expect(receiveBody('r1', items, {})).toBeNull();
  });
});

describe('display helpers', () => {
  it('names an item and colours the status', () => {
    expect(itemName(item({ productVariant: { basicProduct: { title: 'Rice' }, name: 'Bag' } }))).toBe('Rice (Bag)');
    expect(itemName(item({ productVariant: { basicProduct: { title: 'Rice' }, name: 'ns' } }))).toBe('Rice');
    expect(itemName(item())).toBe('?');
    expect([repTone('received'), repTone('approved'), repTone('receiving'), repTone('draft'), repTone('deleted')]).toEqual(['success', 'info', 'warning', 'outline', 'destructive']);
  });

  it('builds the list query', () => {
    expect(repQuery({ limit: 30, offset: 0 })).toBe('limit=30&offset=0');
    expect(repQuery({ status: 'draft', limit: 10, offset: 20 })).toBe('limit=10&offset=20&status=draft');
  });
});

describe('suggestions', () => {
  const s = (over = {}) => ({ id: 'v1', name: 'Bag', basicProduct: { title: 'Flour' }, stock: 2, sourceStock: 50, lowStockQty: 5, idealStockQty: 20, purchasedCost: 1.5, ...over });
  it('tops up to the ideal level, limited by what this branch has', () => {
    expect(suggestedLines([s()])).toEqual([{ variantId: 'v1', name: 'Flour (Bag)', sentQty: 18, cost: 1.5 }]);
    expect(suggestedLines([s({ sourceStock: 4 })])[0]!.sentQty).toBe(4);
  });
  it('uses the low level when no ideal is set and skips what cannot be sent', () => {
    expect(suggestedLines([s({ idealStockQty: null })])[0]!.sentQty).toBe(3);
    expect(suggestedLines([s({ sourceStock: 0 }), s({ stock: 30 })])).toEqual([]);
  });
});

describe('picking list', () => {
  const row = (over: Partial<PickRow> = {}): PickRow => ({ variant: { id: 'v1', name: 'Bag', basicProduct: { title: 'Flour' } }, slot: { id: 's1', name: 'A1' }, lot: { id: 'l1', lotNumber: 'LOT-1' }, qty: 4, ...over });
  it('names, counts and finds rows to verify', () => {
    const rows = [row(), row({ lot: { id: 'l2', lotNumber: 'LOT-2' }, status: 'verified' }), row({ lot: null })];
    expect(pickName(rows[0]!)).toBe('Flour (Bag)');
    expect(isVerified(rows[1]!)).toBe(true);
    expect(verifiable(rows)).toHaveLength(1);
    expect(pickProgress(rows)).toEqual({ verified: 1, total: 2 });
    expect(matchLotNumber(rows, ' lot-1 ')?.lot?.id).toBe('l1');
    expect(matchLotNumber(rows, 'LOT-2')).toBeNull();
    expect(matchLotNumber(rows, '')).toBeNull();
  });
  it('builds the pick body from complete rows only', () => {
    expect(pickBody([row(), row({ lot: null })])).toEqual([{ variantId: 'v1', slotId: 's1', qty: 4, lotId: 'l1' }]);
  });
});

describe('replenishment list like the web', () => {
  it('codes, query and tabs depend on the main branch', () => {
    expect(repCode(7)).toBe('TR-0007');
    expect(repCode(null)).toBe('TR-0000');
    expect(repListQuery({ isMain: true, warehouseId: 'w1', offset: 0 })).toBe('limit=30&offset=0');
    expect(repListQuery({ isMain: false, warehouseId: 'w2', offset: 30, status: 'approved' })).toBe('limit=30&offset=30&toWarehouseId=w2&status=approved');
    expect(repFilters(true)).toEqual(['draft', 'approved', 'receiving', 'received']);
    expect(repFilters(false)).toEqual(['approved', 'receiving', 'received']);
  });
  it('names the other branch and the row menu', () => {
    const r = { fromWarehouseId: { name: 'Main' }, toWarehouseId: { name: 'Floor' } };
    expect(otherBranch(r, true)).toBe('Floor');
    expect(otherBranch(r, false)).toBe('Main');
    expect(repActions('draft', true)).toEqual(['edit', 'delete']);
    expect(repActions('draft', false)).toEqual([]);
    expect(repActions('approved', true)).toEqual(['details']);
    expect(repActions('received', false)).toEqual(['details']);
  });
  it('lists the general information', () => {
    const info = repInfo({ id: 'r', status: 'approved', createdAt: '2026-10-01 10:00', createdBy: { fullname: 'Dara' }, fromWarehouseId: { name: 'Main' }, toWarehouseId: { name: 'Floor' }, totalCost: 12.5, totalSentQty: 5, totalReceivedQty: 2 }, 3);
    expect(info.map((x) => x.value)).toEqual(['approved', 'Dara', '2026-10-01', 'Main', 'Floor', '3', '12.5', '5', '2']);
  });
});

describe('replenishment form like the web', () => {
  const cola = { variantId: 'v1', name: 'Cola', price: 1.5, stock: 8 };
  it('adds a line with quantity 0 and the product price, once', () => {
    const f = addRepLine(emptyRepForm('main'), cola);
    expect(f.lines[0]).toEqual({ variantId: 'v1', name: 'Cola', stock: 8, sentQty: 0, costPerUnit: 1.5, amount: 0 });
    expect(addRepLine(f, cola).lines).toHaveLength(1);
  });
  it('recalculates the amount and the totals', () => {
    let f = addRepLine(emptyRepForm('main'), cola);
    f = setRepLine(f, 'v1', { sentQty: 4 });
    expect(f.lines[0]!.amount).toBe(6);
    f = setRepLine(f, 'v1', { costPerUnit: 2 });
    expect(f.lines[0]!.amount).toBe(8);
    expect(repFormTotals(f)).toEqual({ qty: 4, cost: 8 });
    expect(removeRepLine(f, 'v1').lines).toHaveLength(0);
  });
  it('needs a different destination, a line and a quantity', () => {
    let f = emptyRepForm('main');
    expect(repFormProblem(f)).toBe('to');
    f = { ...f, toWarehouseId: 'main' };
    expect(repFormProblem(f)).toBe('same');
    f = { ...f, toWarehouseId: 'floor' };
    expect(repFormProblem(f)).toBe('lines');
    f = addRepLine(f, cola);
    expect(repFormProblem(f)).toBe('qty');
    expect(repFormProblem(setRepLine(f, 'v1', { sentQty: 1 }))).toBeNull();
  });
  it('builds the create (draft) and update bodies and the picking request', () => {
    const f = setRepLine(addRepLine({ ...emptyRepForm('main'), toWarehouseId: 'floor' }, cola), 'v1', { sentQty: 3 });
    expect(repSaveBody(f)).toEqual({ fromWarehouseId: 'main', toWarehouseId: 'floor', status: 'draft', replenishmentDetails: [{ variantId: 'v1', sentQty: 3, costPerUnit: 1.5 }] });
    expect(repSaveBody({ ...f, id: 'r1' })).toEqual({ id: 'r1', fromWarehouseId: 'main', toWarehouseId: 'floor', replenishmentDetails: [{ variantId: 'v1', sentQty: 3, costPerUnit: 1.5 }] });
    expect(JSON.parse(new URLSearchParams(pickingFor(f.lines)).get('items')!)).toEqual([{ variantId: 'v1', toFindQty: 3 }]);
  });
  it('loads a replenishment for editing', () => {
    const d = { replenishmentInfo: { id: 'r1', status: 'draft', fromWarehouseId: { id: 'main' }, toWarehouseId: { id: 'floor' } }, replenishmentDetails: [{ id: 'd1', sentQty: 2, cost: 3, receivedQty: 0, productVariant: { id: 'v1', name: '1kg', basicProduct: { title: 'Rice' } } }] } as unknown as RepDetail;
    expect(repFormFrom(d)).toMatchObject({ id: 'r1', fromWarehouseId: 'main', toWarehouseId: 'floor', lines: [{ variantId: 'v1', name: 'Rice (1kg)', sentQty: 2, costPerUnit: 3, amount: 6 }] });
  });
});

describe('approving with lots', () => {
  const rows = [
    { variant: { id: 'v1', name: '1kg', basicProduct: { title: 'Rice' } }, slot: { name: 'Shelf' }, lot: { id: 'l1', lotNumber: 'L-1' }, qty: 3, status: 'verified' },
    { variant: { id: 'v2', name: 'x', basicProduct: { title: 'Oil' } }, slot: { name: 'Shelf' }, lot: { id: 'l2', lotNumber: 'L-2' }, qty: 1 },
    { variant: { id: 'v3' }, slot: null, lot: null, qty: 1 },
  ] as unknown as PickRow[];
  it('lists the lots and blocks approval until each is verified', () => {
    expect(lotRowsOf(rows).map((l) => l.lotNumber)).toEqual(['L-1', 'L-2']);
    expect(approvalBlockedByLots(rows, true)).toBe(true);
    expect(approvalBlockedByLots(rows, false)).toBe(false);
    expect(approvalBlockedByLots([{ ...rows[1]!, status: 'verified' }, rows[0]!], true)).toBe(false);
    expect(approvalBlockedByLots([rows[2]!], true)).toBe(false);
  });
});

describe('suggestions page like the web', () => {
  const items = [
    { id: 'a', stock: 2, sourceStock: 20, lowStockQty: 5, idealStockQty: 10, purchasedCost: 1.5 },
    { id: 'b', stock: 0, sourceStock: 4, lowStockQty: 5, idealStockQty: 10, purchasedCost: null },
    { id: 'c', stock: 1, sourceStock: 0, lowStockQty: 5, idealStockQty: null, purchasedCost: 3 },
  ];
  it('proposes the ideal level, or everything this branch holds', () => {
    expect(webSendQty(items[0]!)).toBe(10);
    expect(webSendQty(items[1]!)).toBe(4);
    expect(webSendQty(items[2]!)).toBe(0);
    expect(toStockIn(items[0]!)).toBe(8);
    expect(toStockIn(items[2]!)).toBe(-1);
    expect(selectableIds(items)).toEqual(['a', 'b']);
  });
  it('checks selected quantities and totals', () => {
    const rows = suggestRows(items);
    expect(rows.a).toEqual({ variantId: 'a', sentQty: 10, costPerUnit: 1.5 });
    expect(rows.b!.costPerUnit).toBe(0);
    expect(suggestProblem(items, ['a', 'b'], rows)).toBeNull();
    expect(suggestProblem(items, ['a'], { ...rows, a: { ...rows.a!, sentQty: 0 } })).toEqual({ id: 'a', kind: 'min' });
    expect(suggestProblem(items, ['a'], { ...rows, a: { ...rows.a!, sentQty: 21 } })).toEqual({ id: 'a', kind: 'max' });
    expect(suggestProblem(items, ['c'], rows)).toEqual({ id: 'c', kind: 'min' });
    expect(suggestTotals(['a', 'b'], rows)).toEqual({ qty: 14, cost: 15 });
  });
  it('builds a draft for the selected items only', () => {
    const rows = suggestRows(items);
    expect(suggestBody('main', 'floor', ['b'], rows)).toEqual({ fromWarehouseId: 'main', toWarehouseId: 'floor', status: 'draft', replenishmentDetails: [{ variantId: 'b', sentQty: 4, costPerUnit: 0 }] });
  });
});
