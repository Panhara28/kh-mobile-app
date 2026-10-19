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
}

export interface OrderFilter {
  status?: OrderStatus;
  invoiceNo?: string;
  startDate?: string;
  endDate?: string;
  shiftId?: string;
  limit?: number;
  offset?: number;
}

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
  return p.toString();
}

/** Counts and totals of the orders shown, like the web's order summary cards. */
export function summarize(orders: OrderRow[]) {
  const out = { completedCount: 0, completedTotal: 0, draftCount: 0, draftTotal: 0 };
  for (const o of orders) {
    const amount = parseFloat(o.totalAmount ?? '0') || 0;
    if (o.orderStatus === 'COMPLETED') {
      out.completedCount++;
      out.completedTotal += amount;
    } else if (o.orderStatus === 'DRAFT') {
      out.draftCount++;
      out.draftTotal += amount;
    }
  }
  return { ...out, completedTotal: Math.round(out.completedTotal * 100) / 100, draftTotal: Math.round(out.draftTotal * 100) / 100 };
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
