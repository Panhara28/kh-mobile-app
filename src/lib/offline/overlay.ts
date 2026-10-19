import type { ItemStatus, OrderLine, RestaurantTable } from '../api';
import { activeLines, mergeTarget, modifierPrice, pendingQty, statusQty, unitPrice } from '../order';
import { toKhPosTime } from '../time';
import type {
  AddLinePayload,
  MoveStatusPayload,
  OutboxCommand,
  SetDiscountPayload,
  SetNotePayload,
  SetOptionPayload,
  SetPromotionPayload,
  SetStatusPayload,
} from './types';

/** Id of the order a table gets on screen before kh-pos has opened it. */
export const localOrderId = (tableId: string) => `local:${tableId}`;

const STATUSES: ItemStatus[] = ['pending', 'cooking', 'ready', 'served'];
const money = (n: number) => String(Math.round(n * 100) / 100);

function setStatus(line: OrderLine, status: ItemStatus, qty: number, at: string) {
  const status_ = (line.status ??= []);
  const entry = status_.find((s) => s.status === status);
  if (entry) entry.qty = qty;
  else status_.push({ status, qty, createdAt: at });
  const oldQty = Number(line.qty) || 0;
  const newQty = STATUSES.reduce((a, s) => a + statusQty(line, s), 0);
  // Keep the line's price per portion (with its options), as kh-pos would after the change.
  const unit = oldQty > 0 ? (Number(line.totalAmount) || 0) / oldQty : Number(line.price) || 0;
  line.qty = newQty;
  line.totalAmount = money(unit * newQty);
}

const num = (v: unknown) => Number(v) || 0;

/** Money on the line changes by `delta` (estimates: kh-pos recalculates when it receives the change). */
function adjustTotal(line: OrderLine, delta: number) {
  line.totalAmount = money(Math.max(0, num(line.totalAmount) + delta));
}

const lineById = (order: RestaurantTable['order'], id: string) => (order?.items ?? []).find((l) => l.orderDetailId === id);

/** Money off the line from its manual discount, as far as the app can tell. */
function manualAmount(line: OrderLine, d: SetDiscountPayload): number {
  const gross = num(line.price) * num(line.qty);
  const off = d.discountType === 'PERCENTAGE' ? (gross * d.amount) / 100 : d.amount;
  return Math.max(0, Math.min(gross, Math.round(off * 100) / 100));
}

function setNoteLocal(line: OrderLine, p: SetNotePayload) {
  const mods = (line.orderModifiers ??= []);
  const existing = mods.find((m) => m.modifierItemId === 'notes');
  const before = existing ? num(existing.price) : 0;
  if (existing) {
    existing.notes = p.notes;
    existing.price = p.price;
  } else {
    mods.push({ orderDetailId: line.orderDetailId, modifierItemId: 'notes', price: p.price, notes: p.notes });
  }
  line.modiferAmount = money(num(line.modiferAmount) + (p.price - before) * num(line.qty));
  adjustTotal(line, (p.price - before) * num(line.qty));
}

function setOptionLocal(line: OrderLine, p: SetOptionPayload) {
  const mods = (line.orderModifiers ??= []);
  const has = mods.some((m) => m.modifierItemId === p.modifierItemId);
  if (p.on && !has) {
    mods.push({ orderDetailId: line.orderDetailId, modifierItemId: p.modifierItemId, price: p.price });
    line.modiferAmount = money(num(line.modiferAmount) + p.price * num(line.qty));
    adjustTotal(line, p.price * num(line.qty));
  } else if (!p.on && has) {
    line.orderModifiers = mods.filter((m) => m.modifierItemId !== p.modifierItemId);
    line.modiferAmount = money(Math.max(0, num(line.modiferAmount) - p.price * num(line.qty)));
    adjustTotal(line, -p.price * num(line.qty));
  }
}

function setDiscountLocal(line: OrderLine, p: SetDiscountPayload) {
  const discounts = (line.discounts ??= []);
  const old = discounts.find((d) => d.isManualDiscount || d.discountId === 'manual');
  const before = num(old?.amount);
  if (!(p.amount > 0)) {
    // an amount of 0 removes the manual discount (that is how kh-pos is told to)
    line.discounts = discounts.filter((d) => d !== old);
    line.discountAmount = money(Math.max(0, num(line.discountAmount) - before));
    adjustTotal(line, before);
    return;
  }
  const amount = manualAmount(line, p);
  const next = { discountId: 'manual', name: 'Manual discount', discountType: p.discountType, value: p.amount, isManualDiscount: true, amount };
  if (old) Object.assign(old, next);
  else discounts.push(next);
  line.discountAmount = money(Math.max(0, num(line.discountAmount) - before + amount));
  adjustTotal(line, before - amount);
}

function setPromotionLocal(line: OrderLine, p: SetPromotionPayload) {
  const discounts = (line.discounts ??= []);
  const has = discounts.some((d) => d.discountId === p.discountId);
  if (p.on && !has) discounts.push({ discountId: p.discountId, name: p.name });
  else if (!p.on && has) line.discounts = discounts.filter((d) => d.discountId !== p.discountId);
  // the money effect is worked out by kh-pos
}

function orderTotal(order: NonNullable<RestaurantTable['order']>) {
  return money(activeLines(order).reduce((a, l) => a + (Number(l.totalAmount) || 0), 0));
}

function addLocalLine(order: NonNullable<RestaurantTable['order']>, p: AddLinePayload, at: string) {
  const note = p.note.trim();
  const plain = p.options.length === 0 && !note;
  const target = plain ? mergeTarget(order, p.product, p.capEnabled) : null;
  if (target) {
    setStatus(target, 'pending', pendingQty(target) + p.qty, at);
    return;
  }
  const price = unitPrice(p.product);
  const extras = p.options.reduce((a, o) => a + modifierPrice(o), 0);
  const modifiers: NonNullable<OrderLine['orderModifiers']> = p.options.map((o) => ({
    orderDetailId: p.lineId,
    modifierItemId: o.id,
    price: modifierPrice(o),
  }));
  if (note) modifiers.push({ orderDetailId: p.lineId, modifierItemId: 'notes', price: 0, notes: note });
  (order.items ??= []).push({
    orderDetailId: p.lineId,
    variantId: p.product.variantId,
    title: p.product.productTitle,
    qty: p.qty,
    price: String(price),
    totalAmount: money((price + extras) * p.qty),
    modiferAmount: money(extras * p.qty),
    createdAt: at,
    status: [{ status: 'pending', qty: p.qty, createdAt: at }],
    orderModifiers: modifiers,
    localOnly: true,
  });
}

/**
 * The table as it will look once the changes waiting in the outbox have reached kh-pos: the
 * server (or cached) table with those changes applied the same way kh-pos would apply them.
 * Totals are estimates (no promotions or order discounts); kh-pos recalculates when it
 * receives the changes. Failed commands are not applied.
 */
export function applyOutbox(table: RestaurantTable, commands: OutboxCommand[]): RestaurantTable {
  const mine = commands.filter((c) => c.tableId === table.id && c.status === 'pending');
  if (mine.length === 0) return table;

  const t = JSON.parse(JSON.stringify(table)) as RestaurantTable;
  const originalStatus = t.status;

  for (const c of mine) {
    const at = toKhPosTime(new Date(c.createdAt));
    switch (c.kind) {
      case 'addLine': {
        const p = c.payload as AddLinePayload;
        if (!t.order) {
          t.order = { orderId: localOrderId(t.id), invoiceNo: '', totalAmount: '0', items: [], customer: null, localOnly: true };
          t.status = 'order_taken';
        }
        addLocalLine(t.order, p, at);
        break;
      }
      case 'setPending': {
        const p = c.payload as { orderDetailId: string; qty: number };
        const line = activeLines(t.order).find((l) => l.orderDetailId === p.orderDetailId);
        if (line) setStatus(line, 'pending', Math.max(0, p.qty), at);
        break;
      }
      case 'removeLine': {
        const p = c.payload as { orderDetailId: string };
        if (t.order) t.order.items = (t.order.items ?? []).filter((l) => l.orderDetailId !== p.orderDetailId);
        break;
      }
      case 'setGuests': {
        const p = c.payload as { count: number };
        if (t.order) t.order.customer = p.count;
        break;
      }
      case 'setStatus': {
        const p = c.payload as SetStatusPayload;
        const line = lineById(t.order, p.orderDetailId);
        if (line) setStatus(line, p.status, Math.max(0, p.qty), at);
        break;
      }
      case 'moveStatus': {
        const p = c.payload as MoveStatusPayload;
        const line = lineById(t.order, p.orderDetailId);
        if (line) {
          const qty = Math.min(p.qty, statusQty(line, p.from));
          if (qty > 0) {
            const to = p.to === 'cooking' ? statusQty(line, 'cooking') : statusQty(line, 'served');
            setStatus(line, p.from, statusQty(line, p.from) - qty, at);
            setStatus(line, p.to, to + qty, at);
          }
        }
        break;
      }
      case 'serveAll': {
        for (const line of activeLines(t.order)) {
          const cooking = statusQty(line, 'cooking');
          if (cooking < 1) continue;
          setStatus(line, 'cooking', 0, at);
          setStatus(line, 'served', statusQty(line, 'served') + cooking, at);
        }
        break;
      }
      case 'setNote': {
        const line = lineById(t.order, (c.payload as SetNotePayload).orderDetailId);
        if (line) setNoteLocal(line, c.payload as SetNotePayload);
        break;
      }
      case 'setOption': {
        const line = lineById(t.order, (c.payload as SetOptionPayload).orderDetailId);
        if (line) setOptionLocal(line, c.payload as SetOptionPayload);
        break;
      }
      case 'setDiscount': {
        const line = lineById(t.order, (c.payload as SetDiscountPayload).orderDetailId);
        if (line) setDiscountLocal(line, c.payload as SetDiscountPayload);
        break;
      }
      case 'setPromotion': {
        const line = lineById(t.order, (c.payload as SetPromotionPayload).orderDetailId);
        if (line) setPromotionLocal(line, c.payload as SetPromotionPayload);
        break;
      }
      case 'checkout':
        t.order = null;
        t.status = 'cleaning';
        break;
      case 'openShift':
      case 'closeShift':
      case 'resend':
        break; // nothing changes on the order itself; the ticket prints after it is sent
      case 'sendToKitchen': {
        for (const line of activeLines(t.order)) {
          const pending = pendingQty(line);
          if (pending < 1) continue;
          const cooking = statusQty(line, 'cooking');
          setStatus(line, 'pending', 0, at);
          setStatus(line, 'cooking', cooking + pending, at);
        }
        break;
      }
    }
    if (t.order) t.order.totalAmount = orderTotal(t.order);
  }

  // A table that only had an offline order and lost all its lines is free again.
  if (t.order?.localOnly && activeLines(t.order).length === 0) {
    t.order = null;
    t.status = originalStatus;
  }
  t.pendingSync = mine.length;
  return t;
}
