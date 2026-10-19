import { ApiError, type ItemStatus, type KhPosApi, type KitchenMove, type MenuProduct, type ModifierItem, type NewLine, type OrderLine, type PosInfo, type RestaurantTable, type StatusMove, type TableOrder } from './api';

/** Portions of a line in one kitchen status. */
export function statusQty(line: OrderLine, status: ItemStatus): number {
  return (line.status ?? []).filter((s) => s.status === status).reduce((a, s) => a + Number(s.qty || 0), 0);
}

/** Portions not sent to the kitchen yet. */
export const pendingQty = (line: OrderLine) => statusQty(line, 'pending');

/** A line can be changed or removed only while nothing of it has gone to the kitchen. */
export function lineStarted(line: OrderLine): boolean {
  return (line.status ?? []).some((s) => s.status !== 'pending' && Number(s.qty) > 0);
}

/** Lines with something on them (kh-pos keeps lines whose portions were all reduced to 0). */
export function activeLines(order: TableOrder | null | undefined): OrderLine[] {
  return (order?.items ?? []).filter((l) => Number(l.qty) > 0);
}

export function orderCounts(order: TableOrder | null | undefined) {
  const lines = activeLines(order);
  const sum = (s: ItemStatus) => lines.reduce((a, l) => a + statusQty(l, s), 0);
  return {
    lines: lines.length,
    portions: lines.reduce((a, l) => a + Number(l.qty), 0),
    pending: sum('pending'),
    cooking: sum('cooking') + sum('ready'),
    served: sum('served'),
  };
}

/**
 * Checkout is allowed once every portion has been served and the order is still open: the web
 * restaurant POS's rule (restaurant-checkout.tsx). An order made offline has no status yet and
 * counts as open.
 */
export function canCheckout(order: TableOrder | null | undefined): boolean {
  const lines = activeLines(order);
  if (lines.length === 0) return false;
  const served = lines.reduce((a, l) => a + statusQty(l, 'served'), 0);
  const all = lines.reduce((a, l) => a + (l.status ?? []).reduce((c, s) => c + Number(s.qty || 0), 0), 0);
  return served === all && (!order?.orderStatus || order.orderStatus === 'DRAFT');
}

/** "Send to kitchen": every pending portion goes to cooking, like the web POS. */
export function kitchenMoves(order: TableOrder | null | undefined): KitchenMove[] {
  return activeLines(order)
    .map((l) => ({ orderDetailId: l.orderDetailId, fromStatus: 'pending' as const, toStatus: 'cooking' as const, qty: pendingQty(l) }))
    .filter((m) => m.qty > 0);
}

/**
 * Line to add a tapped dish to, or null for a new line. Same rule as the kh-pos web POS
 * (RestaurantaAction.resolveAddTarget):
 *  - same dish with no options or note → that line, whatever its kitchen status
 *    (it gets one more pending portion, e.g. "Pending 1 · Served 1");
 *  - except with the branch's "max quantity per line" discount cap on, for a dish with a
 *    menu discount: reuse a line whose discount is already used up (amount 0), otherwise a new
 *    line, so the extra portion is charged full price on its own line.
 */
export function mergeTarget(
  order: TableOrder | null | undefined,
  product: Pick<MenuProduct, 'variantId' | 'price' | 'discountedPrice'>,
  capEnabled = false,
): OrderLine | null {
  const identical = activeLines(order).filter((l) => l.variantId === product.variantId && (l.orderModifiers ?? []).length === 0);
  if (identical.length === 0) return null;
  if (!capEnabled || !hasMenuDiscount(product)) return identical[0]!;
  return (
    [...identical].reverse().find((l) => {
      const d = (l.discounts ?? []).find((x) => x.discountId === 'variant');
      return !!d && Number(d.amount ?? 0) === 0;
    }) ?? null
  );
}

/** The dish has a product-variant menu discount (shown struck through on the menu). */
export function hasMenuDiscount(product: Pick<MenuProduct, 'price' | 'discountedPrice'>): boolean {
  return product.discountedPrice != null && Number(product.discountedPrice) < Number(product.price ?? 0);
}

/** Names of modifier options, from the menu data (order lines only carry option ids). */
export function modifierNames(products: MenuProduct[]): Map<string, ModifierItem> {
  const map = new Map<string, ModifierItem>();
  for (const p of products) for (const g of p.modifiers ?? []) for (const i of g.items ?? []) map.set(i.id, i);
  return map;
}

/** "Fried egg +$0.50, no chili" style description of a line's options and note. */
export function lineExtras(line: OrderLine, names: Map<string, ModifierItem>): { options: string[]; note: string | null } {
  const options: string[] = [];
  let note: string | null = null;
  for (const m of line.orderModifiers ?? []) {
    if (m.modifierItemId === 'notes') note = m.notes?.trim() || note;
    else options.push(names.get(m.modifierItemId)?.name ?? '?');
  }
  return { options, note };
}

/** Unit price shown and charged when adding: the menu price (staff orders, like the web POS). */
export function unitPrice(product: Pick<MenuProduct, 'price'>): number {
  return Number(product.price ?? 0) || 0;
}

export function modifierPrice(item: Pick<ModifierItem, 'price'>): number {
  return Number(item.price ?? 0) || 0;
}

const MAX_OPEN_ATTEMPTS = 3;

/** kh-pos errors when two orders are opened at once: same table, or same invoice number. */
export function isOpenRace(message: string): boolean {
  return /active order/i.test(message) || /duplicate entry.*invoice_no/i.test(message);
}

export interface AddRequest {
  table: RestaurantTable;
  warehouseId: string;
  product: MenuProduct;
  qty: number;
  options: ModifierItem[];
  note: string;
  /** Branch ORDER_DISCOUNT_RULES "max quantity per line" is on (see mergeTarget). */
  capEnabled?: boolean;
}

/**
 * Adds an item to a table the way the kh-pos web restaurant POS does:
 *  - no open order: mark the table taken, get an invoice number, open the order with this line;
 *  - same plain item still pending: raise its pending quantity;
 *  - otherwise: a new line, then its options and note.
 * Always reload the table afterwards; the server's order is the source of truth.
 * Resolves with the id of the order line the portions ended up on (the new line, or the line
 * they were merged into).
 */
export async function addToTable(
  api: Pick<KhPosApi, 'table' | 'setTableStatus' | 'posInfo' | 'nextInvoiceNumber' | 'createOrder' | 'addLine' | 'addModifier' | 'setPendingQty'>,
  req: AddRequest,
  newId: () => string,
  cache: { posInfo?: PosInfo } = {},
): Promise<string> {
  const note = req.note.trim();
  const plain = req.options.length === 0 && !note;
  const line: NewLine = { id: newId(), variantId: req.product.variantId, qty: req.qty, price: unitPrice(req.product) };

  let order = req.table.order;
  if (!order) {
    if (req.table.status !== 'order_taken') await api.setTableStatus(req.table.id, 'order_taken');
    cache.posInfo ??= await api.posInfo(req.warehouseId);
    for (let attempt = 1; !order; attempt++) {
      try {
        const orderId = await api.createOrder({
          warehouseId: req.warehouseId,
          tableId: req.table.id,
          posInfo: cache.posInfo,
          invoiceNo: await api.nextInvoiceNumber(),
          line,
        });
        await addExtras(api, orderId, line.id, req.options, note);
        return line.id;
      } catch (e) {
        // Another phone opened an order at the same moment. kh-pos only suggests the next
        // invoice number, so both may have got the same one. If it was this table, add to that
        // order; otherwise take a fresh number and try again.
        if (!(e instanceof ApiError) || !isOpenRace(e.message) || attempt >= MAX_OPEN_ATTEMPTS) throw e;
        order = (await api.table(req.table.id)).order;
      }
    }
  }

  const target = plain ? mergeTarget(order, req.product, req.capEnabled) : null;
  if (target) {
    await api.setPendingQty(order.orderId, target.orderDetailId, pendingQty(target) + req.qty);
    return target.orderDetailId;
  }
  await api.addLine(order.orderId, line);
  await addExtras(api, order.orderId, line.id, req.options, note);
  return line.id;
}

export async function addExtras(
  api: Pick<KhPosApi, 'addModifier'>,
  orderId: string,
  orderDetailId: string,
  options: ModifierItem[],
  note: string,
) {
  for (const o of options) {
    await api.addModifier(orderId, { orderDetailId, modifierItemId: o.id, price: modifierPrice(o) });
  }
  if (note) await api.addModifier(orderId, { orderDetailId, modifierItemId: 'notes', price: 0, notes: note });
}

/** "✓" (serve all): every preparing portion → served, like the web POS. */
export function serveMoves(order: TableOrder | null | undefined): StatusMove[] {
  return activeLines(order)
    .map((l) => ({ orderDetailId: l.orderDetailId, fromStatus: 'cooking' as const, toStatus: 'served' as const, qty: statusQty(l, 'cooking') }))
    .filter((m) => m.qty > 0);
}

/**
 * When a line was ordered, sent to the kitchen and served.
 *
 * Sent is the first kitchen ticket printed (print_kitchen_log) when there is one; otherwise the
 * time portions last went to cooking. That status time is reliable with kh-pos's fix that stops
 * overwriting a status row's time when portions leave it (serving used to overwrite it).
 */
export function lineTimes(line: OrderLine): { ordered: string | null; sent: string | null; served: string | null } {
  const entry = (s: ItemStatus) => (line.status ?? []).find((x) => x.status === s);
  const reachedKitchen = statusQty(line, 'cooking') + statusQty(line, 'ready') + statusQty(line, 'served') > 0;
  const printed = (line.kitchenLogs ?? [])
    .map((k) => k.printedAt)
    .filter((t): t is string => !!t)
    .sort()[0];
  return {
    ordered: line.createdAt ?? entry('pending')?.createdAt ?? null,
    sent: reachedKitchen ? (printed ?? entry('cooking')?.createdAt ?? null) : null,
    served: statusQty(line, 'served') > 0 ? (entry('served')?.createdAt ?? null) : null,
  };
}
