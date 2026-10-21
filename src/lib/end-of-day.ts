/** The End of Day Sales Report of the kh-pos web app (Report > End of Day Report). */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export type Summary = Record<string, { qty: number; amount: number }>;

export interface EodReport {
  totalSale: number;
  transactionCount: number;
  servedSummary: Summary;
  paymentSummary: Summary;
  discountSummary: Summary;
  categorySummary: Summary;
  customerSummary: Summary;
}

/** The web query: whole days, the end date to the end of that day, for this branch. */
export function eodQuery(range: { start: string; end: string }, warehouseId: string): string {
  const q = new URLSearchParams({ startDate: range.start.slice(0, 10), endDate: `${range.end.slice(0, 10)} 23:59:59` });
  if (warehouseId) q.set('warehouseId', warehouseId);
  return q.toString();
}

/** Average order value: total sale divided by the number of transactions, 0 when there are none. */
export const averageOrder = (r: Pick<EodReport, 'totalSale' | 'transactionCount'>) => (r.transactionCount > 0 ? n(r.totalSale) / r.transactionCount : 0);

/** The web "Total Discounts" card adds every entry except the last one, which is the server's own total. */
export function totalDiscounts(s: Summary | undefined): number {
  const items = Object.values(s ?? {});
  return cents(items.filter((_, i) => i < items.length - 1).reduce((a, v) => a + n(v.amount), 0));
}

/** In the order the server sends them; "dine_in" is shown as "Walk In". */
export function eodEntries(s: Summary | undefined): { key: string; label: string; qty: number; amount: number }[] {
  return Object.entries(s ?? {}).map(([key, v]) => ({ key, label: key === 'dine_in' ? 'Walk In' : key, qty: n(v.qty), amount: n(v.amount) }));
}

/** The "Discounts Applied" list: the server's total lines are not discount types. */
export const discountTypes = (s: Summary | undefined) => eodEntries(s).filter((e) => e.key !== 'Total' && e.key !== 'Total Discount');

/** Top 10 customers by amount, and how many there are in all. */
export function topCustomers(s: Summary | undefined, limit = 10): { rows: { name: string; qty: number; amount: number }[]; total: number } {
  const all = Object.entries(s ?? {}).map(([name, v]) => ({ name, qty: n(v.qty), amount: n(v.amount) }));
  return { rows: [...all].sort((a, b) => b.amount - a.amount).slice(0, limit), total: all.length };
}

export interface EodLabels {
  title: string;
  totalSales: string;
  transactions: string;
  average: string;
  discounts: string;
  payments: string;
  served: string;
  categories: string;
  discountsApplied: string;
  customers: string;
}

/** The report as plain lines for Share and Print. */
export function eodLines(r: EodReport, money: (v: number) => string, l: EodLabels): { text: string; bold?: boolean }[] {
  const section = (title: string, rows: { label: string; qty: number; amount: number }[]) => (rows.length === 0 ? [] : [{ text: title.toUpperCase(), bold: true }, ...rows.map((x) => ({ text: `${x.label} (${x.qty}): ${money(x.amount)}` }))]);
  return [
    { text: `${l.totalSales}: ${money(r.totalSale)}`, bold: true },
    { text: `${l.transactions}: ${r.transactionCount}` },
    { text: `${l.average}: ${money(averageOrder(r))}` },
    { text: `${l.discounts}: ${money(totalDiscounts(r.discountSummary))}` },
    ...section(l.payments, eodEntries(r.paymentSummary)),
    ...section(l.served, eodEntries(r.servedSummary)),
    ...section(l.categories, eodEntries(r.categorySummary)),
    ...section(l.discountsApplied, discountTypes(r.discountSummary).map((e) => ({ label: e.label, qty: e.qty, amount: e.amount }))),
    ...section(l.customers, topCustomers(r.customerSummary).rows.map((c) => ({ label: c.name, qty: c.qty, amount: c.amount }))),
  ];
}

export const eodText = (title: string, lines: { text: string }[]) => [title, '', ...lines.map((x) => x.text)].join('\n');

export function eodHtml(title: string, lines: { text: string; bold?: boolean }[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<html><body style="font-family:sans-serif;font-size:14px"><h3 style="text-align:center">${esc(title)}</h3>${lines.map((x) => `<div style="${x.bold ? 'font-weight:bold;margin-top:8px' : ''}">${esc(x.text)}</div>`).join('')}</body></html>`;
}
