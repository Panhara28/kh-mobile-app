import { ApiError, type RestaurantTable, type OrderLine, type MenuProduct, type Shift } from '../api';
import type { EngineApi } from './engine';

/**
 * A tiny stand-in for kh-pos, for tests: tables with orders, the same calls the app makes, and
 * switches to simulate the network going away or an answer getting lost after kh-pos acted.
 */
export class FakeServer {
  online = true;
  /** The next write is applied, then answered with a network error (the answer was lost). */
  dropAnswerOnce = false;
  /** Writes that fail with this error (kh-pos says no). */
  rejectWith: ApiError | null = null;
  invoice = 100;
  calls: string[] = [];
  resends: { orderDetailId: string; qty: number }[] = [];
  shifts: Shift[] = [];
  checkouts: { orderId: string; slotId: string; payments: number }[] = [];
  tables: Record<string, RestaurantTable> = {};
  /** Setup changes received (method, path, body), for the record commands. */
  requests: { method: string; path: string; body?: unknown }[] = [];
  /** A message the next record request is refused with (kh-pos says no), once. */
  refuseRequestWith: string | null = null;

  constructor(tableIds: string[] = ['t1']) {
    for (const id of tableIds) this.tables[id] = { id, table_name: id.toUpperCase(), setting_capacity: 4, section: null, status: 'available', order: null };
  }

  private gate(call: string) {
    this.calls.push(call);
    if (!this.online) throw new ApiError('network', undefined, 'offline');
  }

  private write<T>(call: string, apply: () => T): T {
    this.gate(call);
    if (this.rejectWith) throw this.rejectWith;
    const result = apply();
    if (this.dropAnswerOnce) {
      this.dropAnswerOnce = false;
      throw new ApiError('network', undefined, 'answer lost');
    }
    return result;
  }

  private line(orderId: string, id: string): OrderLine {
    for (const t of Object.values(this.tables)) {
      if (t.order?.orderId === orderId) {
        const l = (t.order.items ?? []).find((x) => x.orderDetailId === id);
        if (l) return l;
      }
    }
    throw new ApiError('server', 400, 'no such line');
  }

  private recount(l: OrderLine) {
    l.qty = (l.status ?? []).reduce((a, s) => a + s.qty, 0);
    l.totalAmount = String(l.qty * Number(l.price));
  }

  api: EngineApi = {
    ping: async () => this.online,
    call: (async (method: string, path: string, body?: unknown) =>
      this.write(`${method} ${path}`, () => {
        if (this.refuseRequestWith) {
          const message = this.refuseRequestWith;
          this.refuseRequestWith = null;
          throw new ApiError('server', 400, message);
        }
        this.requests.push({ method, path, body });
        return {};
      })) as EngineApi['call'],
    table: async (id) => {
      this.gate(`table ${id}`);
      return JSON.parse(JSON.stringify(this.tables[id]));
    },
    setTableStatus: async (id, status) => this.write(`setTableStatus ${id}`, () => void (this.tables[id]!.status = status)),
    posInfo: async () => {
      this.gate('posInfo');
      return { posSlotId: 'slot', posCustomerId: 'cust' };
    },
    nextInvoiceNumber: async () => {
      this.gate('nextInvoiceNumber');
      return ++this.invoice;
    },
    createOrder: async (input) =>
      this.write(`createOrder ${input.tableId}`, () => {
        const orderId = `order-${input.tableId}`;
        this.tables[input.tableId]!.order = {
          orderId,
          invoiceNo: input.invoiceNo,
          totalAmount: String(input.line.qty * input.line.price),
          customer: null,
          items: [
            {
              orderDetailId: input.line.id,
              variantId: input.line.variantId,
              title: 'Dish',
              qty: input.line.qty,
              price: String(input.line.price),
              totalAmount: String(input.line.qty * input.line.price),
              status: [{ status: 'pending', qty: input.line.qty }],
              orderModifiers: [],
            },
          ],
        };
        this.tables[input.tableId]!.status = 'order_taken';
        return orderId;
      }),
    addLine: async (orderId, line) =>
      this.write('addLine', () => {
        for (const t of Object.values(this.tables)) {
          if (t.order?.orderId === orderId) {
            t.order.items!.push({
              orderDetailId: line.id,
              variantId: line.variantId,
              title: 'Dish',
              qty: line.qty,
              price: String(line.price),
              totalAmount: String(line.qty * line.price),
              status: [{ status: 'pending', qty: line.qty }],
              orderModifiers: [],
            });
          }
        }
      }),
    addModifier: async (orderId, input) =>
      this.write('addModifier', () => {
        this.line(orderId, input.orderDetailId).orderModifiers!.push({ orderDetailId: input.orderDetailId, modifierItemId: input.modifierItemId, price: input.price, notes: input.notes });
      }),
    setPendingQty: async (orderId, id, qty) =>
      this.write(`setPendingQty ${id} ${qty}`, () => {
        const l = this.line(orderId, id);
        const s = l.status!.find((x) => x.status === 'pending');
        if (s) s.qty = qty;
        else l.status!.push({ status: 'pending', qty });
        this.recount(l);
      }),
    removeLine: async (orderId, id) =>
      this.write(`removeLine ${id}`, () => {
        for (const t of Object.values(this.tables)) if (t.order?.orderId === orderId) t.order.items = t.order.items!.filter((l) => l.orderDetailId !== id);
      }),
    setGuests: async (orderId, count) =>
      this.write(`setGuests ${count}`, () => {
        for (const t of Object.values(this.tables)) if (t.order?.orderId === orderId) t.order.customer = count;
      }),
    shifts: async () => {
      this.gate('shifts');
      return { total: this.shifts.length, data: JSON.parse(JSON.stringify(this.shifts)) as Shift[] };
    },
    openShift: async (input) =>
      this.write('openShift', () => {
        const id = `shift-${this.shifts.length + 1}`;
        this.shifts.push({
          shift_id: id,
          status: 'OPEN',
          opened_at: '2026-10-19 08:00:00',
          closed_at: null,
          opened_cash_usd: String(input.openedCashUsd),
          opened_cash_khr: String(input.openedCashKhr),
          exchange_rate: String(input.exchangeRate),
          opened_by: { id: 'u1', fullname: 'Staff' },
        });
        return id;
      }),
    closeShift: async (input) =>
      this.write('closeShift', () => {
        const s = this.shifts.find((x) => x.shift_id === input.shiftId);
        if (!s || s.status === 'CLOSE') throw new ApiError('server', 400, 'Cannot close the closed shift');
        s.status = 'CLOSE';
      }),
    checkout: async (orderId, input) =>
      this.write('checkout', () => {
        const t = Object.values(this.tables).find((x) => x.order?.orderId === orderId);
        if (!t?.order || t.order.orderStatus === 'COMPLETED') throw new ApiError('server', 400, 'Order not found or already checked out');
        this.checkouts.push({ orderId, slotId: input.slotId, payments: input.payments.length });
        t.order = null;
        t.status = 'cleaning';
      }),
    removeModifier: async (orderId, input) =>
      this.write('removeModifier', () => {
        const l = this.line(orderId, input.orderDetailId);
        l.orderModifiers = l.orderModifiers!.filter((m) => m.modifierItemId !== input.modifierItemId);
      }),
    updateNote: async (orderId, input) =>
      this.write('updateNote', () => {
        const m = this.line(orderId, input.orderDetailId).orderModifiers!.find((x) => x.modifierItemId === 'notes');
        if (m) {
          m.notes = input.notes;
          m.price = input.price;
        }
      }),
    setStatusQty: async (orderId, id, status, qty) =>
      this.write(`setStatusQty ${id} ${status} ${qty}`, () => {
        const l = this.line(orderId, id);
        const s = l.status!.find((x) => x.status === status);
        if (s) s.qty = qty;
        else l.status!.push({ status, qty });
        this.recount(l);
      }),
    moveStatus: async (orderId, moves) =>
      this.write('moveStatus', () => {
        for (const m of moves) {
          const l = this.line(orderId, m.orderDetailId);
          const from = l.status!.find((s) => s.status === m.fromStatus);
          if (!from || from.qty < m.qty) throw new ApiError('server', 400, 'insufficient quantity');
          from.qty -= m.qty;
          const to = l.status!.find((s) => s.status === m.toStatus);
          if (to) to.qty += m.qty;
          else l.status!.push({ status: m.toStatus, qty: m.qty });
          this.recount(l);
        }
      }),
    setManualDiscount: async (orderId, input) =>
      this.write('setManualDiscount', () => {
        const l = this.line(orderId, input.itemId);
        l.discounts = [{ discountId: 'manual', name: 'Manual', discountType: input.discountType, value: input.amount, isManualDiscount: true }];
      }),
    addPromotion: async (orderId, input) =>
      this.write('addPromotion', () => {
        const l = this.line(orderId, input.itemId);
        (l.discounts ??= []).push({ discountId: input.discountId, name: 'Promo' });
      }),
    removePromotion: async (orderId, input) =>
      this.write('removePromotion', () => {
        const l = this.line(orderId, input.itemId);
        l.discounts = (l.discounts ?? []).filter((d) => d.discountId !== input.discountId);
      }),
    resendToKitchen: async (orderDetailId, qty) =>
      this.write(`resend ${orderDetailId} ${qty}`, () => {
        this.resends.push({ orderDetailId, qty });
      }),
    sendToKitchen: async (orderId, moves) =>
      this.write('sendToKitchen', () => {
        for (const m of moves) {
          const l = this.line(orderId, m.orderDetailId);
          const from = l.status!.find((s) => s.status === 'pending')!;
          from.qty -= m.qty;
          const to = l.status!.find((s) => s.status === 'cooking');
          if (to) to.qty += m.qty;
          else l.status!.push({ status: 'cooking', qty: m.qty });
          this.recount(l);
        }
      }),
  };

  /** Lines of a table as "variant×qty(pending/cooking)" for short assertions. */
  summary(tableId = 't1'): string[] {
    return (this.tables[tableId]!.order?.items ?? []).map((l) => {
      const q = (s: string) => l.status!.find((x) => x.status === s)?.qty ?? 0;
      return `${l.variantId}×${l.qty}(${q('pending')}/${q('cooking')})`;
    });
  }
}

export const dish = (variantId: string, price = 2): MenuProduct => ({ productId: `p-${variantId}`, variantId, productTitle: `Dish ${variantId} (Std)`, price });
