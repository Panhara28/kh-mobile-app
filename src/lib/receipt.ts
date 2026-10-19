import type { CheckoutPayment, ModifierItem, OrderDetailResult, OrderLine, PaymentMethod, PaymentRow, TableOrder } from './api';
import { splitTitle } from './menu';
import { formatMoney, type CurrencyCode } from './money';
import { lineExtras } from './order';
import { otherCurrencyValue } from './payment';

/** What a receipt shows. Built from an order that was just paid, or from kh-pos' copy of it. */
export interface Receipt {
  orderId: string;
  invoiceNo: string;
  tableName: string | null;
  cashier: string | null;
  paidAt: string | null;
  guests: number | null;
  lines: { title: string; qty: number; price: number; total: number; extras: string[] }[];
  total: number;
  discount: number;
  payments: { method: string; currency: 'USD' | 'KHR'; amount: number; amountUsd: number }[];
  change: number;
  exchangeRate: number;
  currency: CurrencyCode;
  /** Made on the phone while kh-pos couldn't be reached: not in kh-pos yet. */
  offline?: boolean;
}

const n = (v: unknown) => Number(v) || 0;
const methodName = (methods: Map<string, string>, id: string) => methods.get(id) ?? id;

export function methodNames(methods: PaymentMethod[]): Map<string, string> {
  return new Map(methods.map((m) => [m.method_id, m.method ?? m.method_id]));
}

function linesOf(items: OrderLine[], names: Map<string, ModifierItem>): Receipt['lines'] {
  return items
    .filter((l) => n(l.qty) > 0)
    .map((l) => {
      const { options, note } = lineExtras(l, names);
      return { title: l.title, qty: n(l.qty), price: n(l.price), total: n(l.totalAmount), extras: [...options, ...(note ? [`"${note}"`] : [])] };
    });
}

function changeOf(payments: { amountUsd: number }[], total: number) {
  return Math.max(0, Math.round((payments.reduce((a, p) => a + p.amountUsd, 0) - total) * 100) / 100);
}

/** Receipt for an order paid on this phone (works offline: nothing is read from kh-pos). */
export function receiptFromCheckout(input: {
  order: TableOrder;
  tableName: string | null;
  cashier: string | null;
  names: Map<string, ModifierItem>;
  methods: Map<string, string>;
  payments: CheckoutPayment[];
  total: number;
  exchangeRate: number;
  currency: CurrencyCode;
  paidAt: string;
  offline: boolean;
}): Receipt {
  const items = input.order.items ?? [];
  const payments = input.payments.map((p) => ({ method: methodName(input.methods, p.paymentMethod), currency: p.currency, amount: p.amount, amountUsd: p.amountUsd }));
  return {
    orderId: input.order.orderId,
    invoiceNo: input.order.localOnly ? '' : String(input.order.invoiceNo ?? ''),
    tableName: input.tableName,
    cashier: input.cashier,
    paidAt: input.paidAt,
    guests: input.order.customer ?? null,
    lines: linesOf(items, input.names),
    total: input.total,
    discount: items.reduce((a, l) => a + n(l.discountAmount), 0),
    payments,
    change: changeOf(payments, input.total),
    exchangeRate: input.exchangeRate,
    currency: input.currency,
    offline: input.offline,
  };
}

/** Receipt from kh-pos' copy of a finished order. */
export function receiptFromDetail(d: OrderDetailResult, opts: { names: Map<string, ModifierItem>; methods: Map<string, string>; exchangeRate: number; currency: CurrencyCode }): Receipt {
  const info = d.orderInfo;
  const total = n(info.totalAmount);
  const payments = (d.payments ?? []).map((p: PaymentRow) => ({
    method: methodName(opts.methods, p.paymentMethod),
    currency: p.currency,
    amount: n(p.amount),
    amountUsd: n(p.amountUsd ?? p.amount),
  }));
  return {
    orderId: info.orderId,
    invoiceNo: String(info.invoiceNo ?? ''),
    tableName: info.tableName ?? null,
    cashier: info.createdBy?.fullname || info.createdBy?.username || null,
    paidAt: info.paidAt ?? null,
    guests: info.customer ?? null,
    lines: linesOf(d.orderDetail, opts.names),
    total,
    discount: d.orderDetail.reduce((a, l) => a + n(l.discountAmount), 0),
    payments,
    change: changeOf(payments, total),
    exchangeRate: opts.exchangeRate,
    currency: opts.currency,
  };
}

export interface ReceiptLabels {
  title: string;
  invoice: string;
  table: string;
  cashier: string;
  guests: string;
  date: string;
  total: string;
  discount: string;
  paid: string;
  change: string;
  thanks: string;
  notSent: string;
}

/** Plain text, for sharing to a messaging app or a printer app. */
export function receiptText(r: Receipt, l: ReceiptLabels): string {
  const money = (v: number) => formatMoney(v, r.currency);
  const out: string[] = [l.title, ''];
  if (r.invoiceNo) out.push(`${l.invoice}: #${r.invoiceNo}`);
  if (r.tableName) out.push(`${l.table}: ${r.tableName}`);
  if (r.cashier) out.push(`${l.cashier}: ${r.cashier}`);
  if (r.guests) out.push(`${l.guests}: ${r.guests}`);
  if (r.paidAt) out.push(`${l.date}: ${r.paidAt}`);
  out.push('--------------------------------');
  for (const line of r.lines) {
    out.push(`${line.qty} × ${splitTitle(line.title).name} (${money(line.price)})  ${money(line.total)}`);
    for (const e of line.extras) out.push(`    + ${e}`);
  }
  out.push('--------------------------------');
  if (r.discount > 0) out.push(`${l.discount}: -${money(r.discount)}`);
  const other = otherCurrencyValue(r.total, r.currency, r.exchangeRate);
  out.push(`${l.total}: ${money(r.total)} (${formatMoney(other.amount, other.currency)})`);
  for (const p of r.payments) out.push(`${l.paid} ${p.method}: ${formatMoney(p.amount, p.currency)}`);
  if (r.change > 0) out.push(`${l.change}: ${money(r.change)}`);
  if (r.offline) out.push('', l.notSent);
  out.push('', l.thanks);
  return out.join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A small printable page (80 mm style) for expo-print. */
export function receiptHtml(r: Receipt, l: ReceiptLabels): string {
  const money = (v: number) => esc(formatMoney(v, r.currency));
  const rows = r.lines
    .map(
      (line) =>
        `<tr><td>${line.qty} × ${esc(splitTitle(line.title).name)}${line.extras.map((e) => `<div class="x">+ ${esc(e)}</div>`).join('')}</td><td class="r">${money(line.total)}</td></tr>`,
    )
    .join('');
  const meta = [
    r.invoiceNo ? `${l.invoice}: #${esc(r.invoiceNo)}` : '',
    r.tableName ? `${l.table}: ${esc(r.tableName)}` : '',
    r.cashier ? `${l.cashier}: ${esc(r.cashier)}` : '',
    r.paidAt ? `${l.date}: ${esc(r.paidAt)}` : '',
  ]
    .filter(Boolean)
    .map((m) => `<div>${m}</div>`)
    .join('');
  const pays = r.payments.map((p) => `<tr><td>${esc(l.paid)} ${esc(p.method)}</td><td class="r">${esc(formatMoney(p.amount, p.currency))}</td></tr>`).join('');
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
body{font-family:sans-serif;font-size:14px;width:280px;margin:0 auto;padding:8px}
h2{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}
.r{text-align:right}.x{font-size:12px;color:#555}hr{border:0;border-top:1px dashed #888}.c{text-align:center}.b{font-weight:bold;font-size:16px}
</style></head><body><h2>${esc(l.title)}</h2>${meta}<hr/><table>${rows}</table><hr/>
<table>${r.discount > 0 ? `<tr><td>${esc(l.discount)}</td><td class="r">-${money(r.discount)}</td></tr>` : ''}
<tr class="b"><td>${esc(l.total)}</td><td class="r">${money(r.total)}</td></tr>${pays}${r.change > 0 ? `<tr><td>${esc(l.change)}</td><td class="r">${money(r.change)}</td></tr>` : ''}</table>
${r.offline ? `<p class="c">${esc(l.notSent)}</p>` : ''}<p class="c">${esc(l.thanks)}</p></body></html>`;
}
