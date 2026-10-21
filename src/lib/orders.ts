import type { OrderLine } from './api';

export type OrderStatus = 'DRAFT' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'REFUND';

export const ORDER_STATUSES: OrderStatus[] = ['DRAFT', 'APPROVED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REFUND'];

/** One row of the order list (GET /api/pos/order). */
export interface OrderRow {
  orderId: string;
  invoiceNo: number | string;
  orderStatus: OrderStatus | string;
  createdAt: string | null;
  paidAt?: string | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
  totalAmount: string;
  tableNumber?: string | null;
  items?: { qty?: number | string }[];
  printCount?: number;
  servedType?: string | null;
  customerLoader?: { customerName?: string | null; phone?: string | null; email?: string | null } | null;
}

export interface OrderFilter {
  status?: OrderStatus;
  invoiceNo?: string;
  startDate?: string;
  endDate?: string;
  shiftId?: string;
  customerPhone?: string;
  ticketCode?: string;
  limit?: number;
  offset?: number;
}

/** The web order filter offers only these two statuses. */
export const LIST_STATUSES: OrderStatus[] = ['DRAFT', 'COMPLETED'];

export type SearchType = 'invoice' | 'phone' | 'ticketCode';

/**
 * What the web search box sets: the invoice number (digits only), the customer phone or a cinema
 * ticket code. While something is searched the status filter is dropped.
 */
export function searchFilter(type: SearchType, text: string): Pick<OrderFilter, 'invoiceNo' | 'customerPhone' | 'ticketCode'> {
  const v = text.trim();
  if (!v) return {};
  if (type === 'invoice') {
    const digits = invoiceDigits(v);
    return digits ? { invoiceNo: digits } : {};
  }
  return type === 'phone' ? { customerPhone: v } : { ticketCode: v };
}

export const hasActiveFilters = (f: OrderFilter) => !!(f.invoiceNo || f.customerPhone || f.startDate || f.endDate || f.status || f.shiftId || f.ticketCode);

/** The web filter keeps only the digits of what is typed in the invoice box ("#1234" → "1234"). */
export function invoiceDigits(text: string): string | undefined {
  return text.trim().match(/\d+/)?.[0];
}

export function orderQuery(f: OrderFilter): string {
  const p = new URLSearchParams();
  p.set('limit', String(f.limit ?? 30));
  p.set('offset', String(f.offset ?? 0));
  if (f.status) p.set('status', f.status);
  if (f.invoiceNo) p.set('invoiceNo', f.invoiceNo);
  if (f.startDate) p.set('startDate', f.startDate);
  if (f.endDate) p.set('endDate', f.endDate);
  if (f.shiftId) p.set('shiftId', f.shiftId);
  if (f.customerPhone) p.set('customerPhone', f.customerPhone);
  if (f.ticketCode) p.set('ticketCode', f.ticketCode);
  return p.toString();
}

/** The web summary reads every order of the period (up to 10000), not only the page shown. */
export const SUMMARY_LIMIT = 10000;

export interface OrderSummary {
  completedCount: number;
  completedTotal: number;
  draftCount: number;
  draftTotal: number;
  expectationCount: number;
  expectationTotal: number;
  byServedType: { servedType: string; count: number; total: number }[];
}

/** Completed, draft and expected revenue, and the totals per served type (biggest first), like the web summary cards. */
export function summarize(orders: OrderRow[]): OrderSummary {
  const out = { completedCount: 0, completedTotal: 0, draftCount: 0, draftTotal: 0, expectationCount: 0, expectationTotal: 0 };
  const byType = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    const amount = parseFloat(o.totalAmount ?? '0') || 0;
    if (o.orderStatus === 'COMPLETED') {
      out.completedCount++;
      out.completedTotal += amount;
    } else if (o.orderStatus === 'DRAFT') {
      out.draftCount++;
      out.draftTotal += amount;
    }
    out.expectationCount++;
    out.expectationTotal += amount;
    const key = o.servedType ?? 'unknown';
    const e = byType.get(key) ?? { count: 0, total: 0 };
    e.count++;
    e.total += amount;
    byType.set(key, e);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    ...out,
    completedTotal: r2(out.completedTotal),
    draftTotal: r2(out.draftTotal),
    expectationTotal: r2(out.expectationTotal),
    byServedType: [...byType.entries()].map(([servedType, v]) => ({ servedType, count: v.count, total: r2(v.total) })).sort((x, y) => y.total - x.total),
  };
}

/** Served types the web summary names; anything else is "unknown". */
export const SERVED_TYPES = ['dine_in', 'take_away', 'food_delivery', 'customer', 'unknown'] as const;
export const servedTypeKey = (t: string) => ((SERVED_TYPES as readonly string[]).includes(t) ? t : 'unknown');

/** The web list shows the paid time, else the created time. */
export const orderWhen = (o: Pick<OrderRow, 'paidAt' | 'createdAt'>) => o.paidAt ?? o.createdAt;

/** Portions on the order (the web "Items" column). */
export const itemCount = (o: Pick<OrderRow, 'items'>) => (o.items ?? []).reduce((a, i) => a + (Number(i.qty) || 0), 0);

/** The web "Created By" column: the customer (with phone and email) for an order they made, else the staff member. */
export function whoFor(o: Pick<OrderRow, 'servedType' | 'customerLoader' | 'createdBy'>): { kind: 'customer' | 'staff'; name: string; phone?: string; email?: string } {
  if (o.servedType === 'customer') return { kind: 'customer', name: o.customerLoader?.customerName || 'Customer', ...(o.customerLoader?.phone ? { phone: o.customerLoader.phone } : {}), ...(o.customerLoader?.email ? { email: o.customerLoader.email } : {}) };
  return { kind: 'staff', name: o.createdBy?.fullname || 'Unknown' };
}

export type OrderAction = 'print' | 'view' | 'open' | 'reverse';

/** The web row menu: print and view always; a draft on a table can be opened, a completed order reversed. */
export function orderActions(o: Pick<OrderRow, 'orderStatus' | 'tableNumber'>): OrderAction[] {
  const out: OrderAction[] = ['print', 'view'];
  if (o.orderStatus === 'DRAFT' && o.tableNumber) out.push('open');
  if (o.orderStatus === 'COMPLETED') out.push('reverse');
  return out;
}

export const statusTone = (status: string) => (status === 'COMPLETED' ? 'success' : status === 'CANCELLED' || status === 'REFUND' ? 'destructive' : status === 'DRAFT' ? 'outline' : 'info') as 'success' | 'destructive' | 'outline' | 'info';

// ---- returns ----

/** Portions of a line already returned. */
export function returnedQty(line: Pick<OrderLine, 'orderReturns'>): number {
  return (line.orderReturns ?? []).reduce((a, r) => a + (Number(r.quantity) || 0), 0);
}

/** What can still be returned: ordered minus already returned. */
export function returnableQty(line: Pick<OrderLine, 'qty' | 'orderReturns'>): number {
  return Math.max(0, (Number(line.qty) || 0) - returnedQty(line));
}

/** Refund for `qty` portions of a line: its price per portion, as the web works it out. */
export function refundFor(line: Pick<OrderLine, 'qty' | 'totalAmount'>, qty: number): number {
  const qtyAll = Number(line.qty) || 0;
  if (qtyAll <= 0) return 0;
  return Math.round(((Number(line.totalAmount) || 0) / qtyAll) * qty * 100) / 100;
}

export interface ReturnInput {
  orderId: string;
  orderItemId: string;
  quantity: number;
  refundAmount: number;
  reason?: string;
}

/** Return lines for the portions the staff chose (quantity 0 or less is left out; never above what is returnable). */
export function buildReturns(orderId: string, lines: OrderLine[], chosen: Record<string, { qty: number; reason?: string }>): ReturnInput[] {
  const out: ReturnInput[] = [];
  for (const line of lines) {
    const c = chosen[line.orderDetailId];
    if (!c) continue;
    const quantity = Math.min(Math.floor(c.qty), returnableQty(line));
    if (quantity < 1) continue;
    out.push({ orderId, orderItemId: line.orderDetailId, quantity, refundAmount: refundFor(line, quantity), ...(c.reason?.trim() ? { reason: c.reason.trim() } : {}) });
  }
  return out;
}

const RECENT_ORDERS = 300;

/** The saved recent orders with newly read ones added (same order replaced), newest first, kept to a few hundred. */
export function mergeRecentOrders(saved: OrderRow[], fresh: OrderRow[]): OrderRow[] {
  const byId = new Map(saved.map((o) => [o.orderId, o]));
  for (const o of fresh) byId.set(o.orderId, o);
  return [...byId.values()].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, RECENT_ORDERS);
}

/**
 * The order list answered from the saved recent orders, for when kh-pos can't be reached: the same status, invoice
 * number, phone and date filters as the server query. A shift or a cinema ticket code can't be worked out from a row,
 * so those are not applied.
 */
export function filterOrdersLocal(all: OrderRow[], f: OrderFilter): { totalRows: number; orders: OrderRow[] } {
  const invoice = f.invoiceNo?.trim();
  const phone = f.customerPhone?.trim();
  const rows = all.filter((o) => {
    if (f.status && o.orderStatus !== f.status) return false;
    if (invoice && !String(o.invoiceNo).includes(invoice)) return false;
    if (phone && !(o.customerLoader?.phone ?? '').includes(phone)) return false;
    const at = o.createdAt ?? '';
    if (f.startDate && at < f.startDate) return false;
    if (f.endDate && at > f.endDate) return false;
    return true;
  });
  const offset = f.offset ?? 0;
  return { totalRows: rows.length, orders: rows.slice(offset, offset + (f.limit ?? 30)) };
}
