import { actualAmount, amountDiff, itemName, logRows, printLogAmount, qtyDiff, voidCsv, voidGroups, voidQuery, voidSummary, whoText, type VoidItem } from './void-report';

const content = (name: string, by: string) => [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'orderBy', value: by }, { key: 'd' }, { key: 'e' }, { key: 'item', value: name }];
const item = (over: Partial<VoidItem> = {}): VoidItem => ({ invoice: 101, orderId: 'o1', orderDetailId: 'd1', printedAt: '2026-10-19 10:00:00', qtyFromPrintLog: 2, priceFromPrintLog: 5, actualQty: 1, actualPrice: 5, status: 'ABNORMAL', content: content('Cola', 'Dara'), payments: [{ createdBy: { fullname: 'Sok' } }], ...over });

describe('void order report', () => {
  it('queries whole days', () => {
    expect(voidQuery({ start: '2026-10-01 00:00:00', end: '2026-10-05 23:59:59' })).toBe('startDate=2026-10-01&endDate=2026-10-05+23%3A59%3A59');
  });
  it('works out amounts and differences', () => {
    expect(printLogAmount(item())).toBe(10);
    expect(actualAmount(item())).toBe(5);
    expect(amountDiff(item())).toBe(5);
    expect(qtyDiff(item())).toBe(1);
    expect(qtyDiff(item({ qtyFromPrintLog: null }))).toBe(0);
    expect(qtyDiff(item({ qtyFromPrintLog: 1 }))).toBe(0);
  });
  it('sums the four cards', () => {
    const items = [item(), item({ orderDetailId: 'd2', status: 'VOIDED', qtyFromPrintLog: 1, actualQty: 0 }), item({ orderId: 'o2', orderDetailId: 'd3', status: 'VOIDED', actualQty: 0 })];
    expect(voidSummary(items)).toEqual({ issues: 3, voidedOrders: 2, abnormal: 1, priceDiscrepancy: 5 + 5 + 10 });
  });
  it('groups lines by order', () => {
    const g = voidGroups([item(), item({ orderDetailId: 'd2' }), item({ orderId: 'o2', invoice: null })]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ orderId: 'o1', invoice: 'Invoice #101', actual: 10, discrepancy: 10 });
    expect(g[0]!.items).toHaveLength(2);
    expect(g[1]!.invoice).toBe('Order');
  });
  it('names the item and who is responsible', () => {
    expect(itemName(item())).toBe('Cola');
    expect(itemName(item({ content: [] }))).toBe('N/A');
    expect(whoText(item())).toBe('Sok');
    expect(whoText(item({ status: 'VOIDED' }))).toBe('Dara');
    expect(whoText(item({ payments: null }))).toBe('N/A');
  });
  it('shows the log and exports the web columns', () => {
    expect(logRows([{ name: 'x', value: 5 }, { value: { a: 1 } }, { key: 'k' }])).toEqual([
      { n: 1, field: 'x', value: '5', type: 'number' },
      { n: 2, field: 'Field 2', value: '{\n  "a": 1\n}', type: 'object' },
      { n: 3, field: 'k', value: 'N/A', type: 'undefined' },
    ]);
    const lines = voidCsv([item()]).split('\n');
    expect(lines[0]).toBe('Invoice,Item Name,Checked Out By,Printed At,Qty From Print Log,Amount From Print Log,Actual Qty,Actual Amount,Qty Discrepancy,Price Discrepancy,Status');
    expect(lines[1]).toBe('101,Cola,Sok,2026-10-19 10:00:00,2,10.00,1,5.00,1,5.00,ABNORMAL');
  });
});
