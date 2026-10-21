/** The Void Order Report of the kh-pos web app: orders whose printed lines differ from what was really sold. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export interface VoidItem {
  invoice?: string | number | null;
  orderId?: string | null;
  orderDetailId: string;
  printedAt?: string | null;
  qtyFromPrintLog: number | null;
  priceFromPrintLog: number;
  actualQty: number;
  actualPrice: number;
  status: 'ABNORMAL' | 'VOIDED' | string;
  /** The print-log fields: index 3 is who ordered, index 6 the item name. */
  content?: { key?: string; name?: string; field?: string; value?: unknown }[];
  payments?: { createdBy?: { fullname?: string | null } | null }[] | null;
}

/** The query the web sends: whole days, the end to the end of that day. */
export function voidQuery(range: { start: string; end: string }): string {
  return new URLSearchParams({ startDate: range.start.slice(0, 10), endDate: `${range.end.slice(0, 10)} 23:59:59` }).toString();
}

export const printLogAmount = (i: Pick<VoidItem, 'priceFromPrintLog' | 'qtyFromPrintLog'>) => n(i.priceFromPrintLog) * n(i.qtyFromPrintLog);
export const actualAmount = (i: Pick<VoidItem, 'actualPrice' | 'actualQty'>) => n(i.actualPrice) * n(i.actualQty);
export const amountDiff = (i: VoidItem) => Math.abs(printLogAmount(i) - actualAmount(i));

/** Total issues, voided orders (distinct), abnormal lines and the total price difference: the four cards. */
export function voidSummary(items: VoidItem[]) {
  return {
    issues: items.length,
    voidedOrders: new Set(items.filter((i) => i.status === 'VOIDED').map((i) => i.orderId).filter(Boolean)).size,
    abnormal: items.filter((i) => i.status === 'ABNORMAL').length,
    priceDiscrepancy: cents(items.reduce((a, i) => a + amountDiff(i), 0)),
  };
}

export interface VoidGroup {
  orderId: string;
  items: VoidItem[];
  invoice: string;
  printedAt: string | null;
  status: string;
  actual: number;
  discrepancy: number;
}

/** Lines grouped by order, in the order the server sends them. */
export function voidGroups(items: VoidItem[]): VoidGroup[] {
  const map = new Map<string, VoidItem[]>();
  for (const i of items) {
    const key = i.orderId ?? '';
    map.set(key, [...(map.get(key) ?? []), i]);
  }
  return [...map.entries()].map(([orderId, list]) => {
    const first = list[0]!;
    const printed = list.reduce((a, i) => a + printLogAmount(i), 0);
    const actual = list.reduce((a, i) => a + actualAmount(i), 0);
    return { orderId, items: list, invoice: first.invoice ? `Invoice #${first.invoice}` : 'Order', printedAt: first.printedAt ?? null, status: first.status, actual: cents(actual), discrepancy: cents(Math.abs(printed - actual)) };
  });
}

const field = (i: VoidItem, index: number) => {
  const v = i.content?.[index]?.value;
  return v == null || v === '' ? 'N/A' : String(v);
};

/** The item name from the print log. */
export const itemName = (i: VoidItem) => field(i, 6);

/** Voided lines show who ordered; abnormal ones who checked the order out. */
export const whoText = (i: VoidItem) => (i.status === 'VOIDED' ? field(i, 3) : (i.payments && i.payments.length > 0 ? i.payments[0]?.createdBy?.fullname || 'N/A' : 'N/A'));

export const qtyDiff = (i: VoidItem) => (i.qtyFromPrintLog !== null && i.qtyFromPrintLog !== i.actualQty ? Math.abs(n(i.qtyFromPrintLog) - i.actualQty) : 0);

/** The print log as "field / value" rows, like the log dialog. */
export function logRows(content: VoidItem['content']): { n: number; field: string; value: string; type: string }[] {
  return (content ?? []).map((c, i) => ({ n: i + 1, field: String(c.key || c.name || c.field || `Field ${i + 1}`), value: typeof c.value === 'object' && c.value !== null ? JSON.stringify(c.value, null, 2) : String(c.value || 'N/A'), type: typeof c.value }));
}

/** The Excel export of the web as CSV text. */
export function voidCsv(items: VoidItem[]): string {
  const head = ['Invoice', 'Item Name', 'Checked Out By', 'Printed At', 'Qty From Print Log', 'Amount From Print Log', 'Actual Qty', 'Actual Amount', 'Qty Discrepancy', 'Price Discrepancy', 'Status'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((i) =>
    [String(i.invoice ?? ''), itemName(i), i.payments && i.payments.length > 0 ? i.payments[0]?.createdBy?.fullname || 'N/A' : 'N/A', i.printedAt ?? 'N/A', i.qtyFromPrintLog ?? 'N/A', printLogAmount(i).toFixed(2), i.actualQty, actualAmount(i).toFixed(2), i.qtyFromPrintLog !== null ? Math.abs(n(i.qtyFromPrintLog) - i.actualQty) : 0, amountDiff(i).toFixed(2), i.status].map(esc).join(','),
  );
  return [head.join(','), ...rows].join('\n');
}
