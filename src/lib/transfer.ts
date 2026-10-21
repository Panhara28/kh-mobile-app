import type { OrderLine, TableOrder } from './api';
import { activeLines, statusQty } from './order';

export type TransferStatus = 'pending' | 'cooking' | 'ready' | 'served';
export const TRANSFER_STATUSES: TransferStatus[] = ['pending', 'cooking', 'ready', 'served'];

/** Portions chosen to move: line id → status → how many. */
export type TransferSelection = Record<string, Partial<Record<TransferStatus, number>>>;

/** What a line has in each status that can move (cancelled portions stay). */
export function movable(line: OrderLine): { status: TransferStatus; qty: number }[] {
  return TRANSFER_STATUSES.map((status) => ({ status, qty: statusQty(line, status) })).filter((s) => s.qty > 0);
}

/** Everything on the order, to move the whole table. */
export function selectAll(order: TableOrder | null | undefined): TransferSelection {
  const out: TransferSelection = {};
  for (const line of activeLines(order)) {
    const m = movable(line);
    if (m.length > 0) out[line.orderDetailId] = Object.fromEntries(m.map((s) => [s.status, s.qty]));
  }
  return out;
}

export function selectedCount(selection: TransferSelection): number {
  return Object.values(selection).reduce((a, s) => a + Object.values(s).reduce((b, q) => b + (q ?? 0), 0), 0);
}

/** The body kh-pos' transfer wants (see the web TransferTable), or null when nothing is chosen. */
export function buildTransfer(input: {
  orderId: string;
  sourceTableId: string;
  destinationTableId: string;
  lines: OrderLine[];
  selection: TransferSelection;
  transferDiscount: boolean;
}) {
  const orderItems = [];
  for (const line of input.lines) {
    const chosen = input.selection[line.orderDetailId];
    if (!chosen) continue;
    const orderItemStatuses = movable(line)
      .map((s) => ({ status: s.status, quantity: Math.min(Math.floor(chosen[s.status] ?? 0), s.qty) }))
      .filter((s) => s.quantity >= 1);
    if (orderItemStatuses.length > 0) orderItems.push({ orderItemId: line.orderDetailId, variantId: line.variantId, orderItemStatuses });
  }
  if (orderItems.length === 0 || input.sourceTableId === input.destinationTableId) return null;
  return {
    sourceTableId: input.sourceTableId,
    orderId: input.orderId,
    orderItems,
    destinationTableId: input.destinationTableId,
    transferDiscount: input.transferDiscount,
  };
}

/** The body of a table transfer. */
export type TransferBody = NonNullable<ReturnType<typeof buildTransfer>>;
