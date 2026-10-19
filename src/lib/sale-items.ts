/** The Sale Item Summary Report of the kh-pos web app. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export interface ItemRow {
  description: string;
  qty: number;
  discount_amount: number;
  total_amount: number;
}

/** The web query: whole days, the end to the end of that day. */
export function itemsQuery(range: { start: string; end: string }): string {
  return new URLSearchParams({ startDate: range.start.slice(0, 10), endDate: `${range.end.slice(0, 10)} 23:59:59` }).toString();
}

/** The three cards: how many items, the quantity sold and the revenue. */
export function itemsSummary(items: ItemRow[]) {
  return {
    totalItems: items.length,
    totalQty: items.reduce((a, r) => a + n(r.qty), 0),
    totalDiscount: cents(items.reduce((a, r) => a + n(r.discount_amount), 0)),
    totalRevenue: cents(items.reduce((a, r) => a + n(r.total_amount), 0)),
  };
}

/** The numbered table as lines for Share and Print, ending with the grand total. */
export function itemLines(items: ItemRow[], money: (v: number) => string, grandTotal: string): { text: string; bold?: boolean }[] {
  const sum = itemsSummary(items);
  return [...items.map((r, i) => ({ text: `${i + 1}. ${r.description}  x${n(r.qty)}  ${money(n(r.total_amount))}` })), { text: `${grandTotal}  x${sum.totalQty}  ${money(sum.totalRevenue)}`, bold: true }];
}
