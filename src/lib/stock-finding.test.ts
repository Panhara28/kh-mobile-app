import { conversionBody, conversionDone, conversionInfo, conversionProblem, draftQuery, pickingQuery, portions, sortPicks, transferBody, variantName, type PickItem } from './stock-finding';

const pos = { id: 'pos', name: 'POS', posSlot: true };
const shelf = { id: 'sh', name: 'Shelf', posSlot: false };
const item = (over: Partial<PickItem> = {}): PickItem => ({ variant: { id: 'v1', name: '1kg', basicProduct: { title: 'Rice' } }, slot: shelf, qty: 3, stock: 10, todoType: 'TRANSFER', ...over });

describe('queries', () => {
  it('lists the first 30 drafts, optionally one invoice', () => {
    expect(draftQuery('')).toBe('offset=0&limit=30&status=DRAFT');
    expect(draftQuery(' 12 ')).toBe('offset=0&limit=30&status=DRAFT&invoiceNo=12');
  });
  it('asks for the picking list of the order lines with conversion', () => {
    const q = new URLSearchParams(pickingQuery([{ variantId: 'v1', qty: 2 }]));
    expect(JSON.parse(q.get('items')!)).toEqual([{ variantId: 'v1', toFindQty: 2 }]);
    expect(q.get('forReplenishment')).toBe('0');
    expect(q.get('needConversion')).toBe('1');
  });
  it('counts portions', () => {
    expect(portions({ items: [{ variantId: 'a', qty: 2 }, { variantId: 'b', qty: 3 }] })).toBe(5);
    expect(portions({})).toBe(0);
  });
});

describe('the four groups', () => {
  it('sorts like the web', () => {
    const s = sortPicks([
      item(),
      item({ slot: pos, todoType: 'TRANSFER' }),
      item({ slot: null, todoType: 'BREAK', breakdownStockInfo: [] }),
      item({ slot: null, todoType: 'TRANSFER', message: 'No stock' }),
      item({ slot: null, qty: 0, todoType: 'TRANSFER' }),
      item({ slot: pos, todoType: 'NOTHING' }),
    ]);
    expect(s.transfer).toHaveLength(1);
    expect(s.convert).toHaveLength(1);
    expect(s.noStock).toHaveLength(1);
    expect(s.available).toHaveLength(1);
  });
  it('names a variant by name, else sku', () => {
    expect(variantName({ name: '1kg' })).toBe('1kg');
    expect(variantName({ name: '', sku: 77 })).toBe('77');
    expect(variantName(null)).toBe('');
  });
});

describe('moving and converting', () => {
  it('builds the transfer into the POS slot', () => {
    expect(transferBody(item(), 'pos', 'o1')).toEqual({ currentSlotId: 'sh', destinationSlotId: 'pos', qty: 3, variantId: 'v1', orderId: 'o1' });
  });
  const src = (id: string, q: number) => ({ variant: { id, name: id }, slot: { id: `s-${id}` }, qty: q });
  it('builds a break, a repack and a mixed conversion', () => {
    const brk = item({ slot: null, todoType: 'BREAK', breakdownStockInfo: [src('big', 1)] });
    expect(conversionBody(brk, 'pos')).toEqual({ destinationVariant: 'v1', sourceToBreak: [{ variantId: 'big', slotId: 's-big', quantity: 1 }], sourceToRepack: [], destinationSlot: 'pos', conversionType: 'BREAK', destinationQty: 3 });
    const rep = item({ slot: null, todoType: 'REPACK', repackStockInfo: [src('small', 6)] });
    expect(conversionBody(rep, 'pos')).toMatchObject({ sourceToBreak: [], sourceToRepack: [{ variantId: 'small', slotId: 's-small', quantity: 6 }], conversionType: 'REPACK' });
    const mix = item({ slot: null, todoType: 'MIXED', breakdownStockInfo: [src('big', 1)], repackStockInfo: [src('small', 6)] });
    expect(conversionBody(mix, 'pos')).toMatchObject({ sourceToBreak: [{ variantId: 'big' }], sourceToRepack: [{ variantId: 'small' }], conversionType: 'MIXED' });
  });
  it('describes and checks a conversion', () => {
    const mix = item({ slot: null, todoType: 'MIXED', breakdownStockInfo: [src('big', 1)], repackStockInfo: [src('small', 6), src('tiny', 2)] });
    expect(conversionInfo(mix)).toBe('1 breakdown + 2 repack sources');
    expect(conversionInfo(item({ todoType: 'BREAK', breakdownStockInfo: [src('b', 1)] }))).toBe('1 breakdown source(s)');
    expect(conversionInfo(item({ todoType: 'REPACK', repackStockInfo: [] }))).toBe('0 repack source(s)');
    expect(conversionInfo(item())).toBe('');
    expect(conversionProblem(item({ todoType: 'MIXED' }))).toBe('mixed');
    expect(conversionProblem(item({ todoType: 'BREAK' }))).toBe('sources');
    expect(conversionProblem(mix)).toBeNull();
    expect(conversionDone(mix)).toEqual({ qty: 3, from: 'breakdown: big, repack: small, tiny', to: '1kg' });
    expect(conversionDone(item({ todoType: 'BREAK', breakdownStockInfo: [src('big', 1)] })).from).toBe('big');
  });
});
