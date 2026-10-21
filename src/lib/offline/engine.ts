import { ApiError, type KhPosApi, type MenuProduct, type OrderLine } from '../api';
import { planAndProduce } from '../production';
import { retailOrderBody } from '../retail';
import type { SecretBox } from './secret';
import { resultOf, withResult } from './steps';
import { buildTransfer, selectAll } from '../transfer';
import { addExtras, addToTable, kitchenMoves, mergeTarget, pendingQty, serveMoves, statusQty } from '../order';
import type {
  AddLinePayload,
  CheckoutCommandPayload,
  CloseShiftPayload,
  CommandKind,
  LocalStore,
  MoveStatusPayload,
  NewCommand,
  OpenShiftPayload,
  OutboxCommand,
  RecordPayload,
  RemoveLinePayload,
  ResendPayload,
  RetailSalePayload,
  TransferPayload,
  SetDiscountPayload,
  SetGuestsPayload,
  SetNotePayload,
  SetOptionPayload,
  SetPendingPayload,
  SetPromotionPayload,
  SetStatusPayload,
} from './types';

export type EngineApi = Pick<
  KhPosApi,
  | 'table'
  | 'setTableStatus'
  | 'posInfo'
  | 'nextInvoiceNumber'
  | 'createOrder'
  | 'addLine'
  | 'addModifier'
  | 'removeModifier'
  | 'updateNote'
  | 'setPendingQty'
  | 'setStatusQty'
  | 'moveStatus'
  | 'setManualDiscount'
  | 'addPromotion'
  | 'removePromotion'
  | 'resendToKitchen'
  | 'shifts'
  | 'openShift'
  | 'closeShift'
  | 'checkout'
  | 'orderDetail'
  | 'stockToTransfer'
  | 'createRetailOrder'
  | 'transferTable'
  | 'removeLine'
  | 'setGuests'
  | 'sendToKitchen'
  | 'ping'
  | 'call'
>;

type CommandPayloadOf<K extends CommandKind> = OutboxCommand<K>['payload'];

export interface EngineState {
  /** kh-pos answered the last time it was asked. Starts true: the first failed call flips it. */
  online: boolean;
  syncing: boolean;
  /** Commands of the signed-in staff member, oldest first (pending and failed). */
  commands: OutboxCommand[];
  pending: number;
  failed: number;
  /** ms since epoch of the last time the outbox was fully replayed (or found empty while online). */
  lastSyncedAt: number | null;
  /** Goes up whenever a replay changed kh-pos, so screens know to reload. */
  syncVersion: number;
}

const ID_MAP_KEY = 'idmap';
/** The message of a change whose answer was lost: the staff must check kh-pos before doing it again. */
export const UNCONFIRMED = 'Could not confirm whether kh-pos received this. Check there before doing it again.';
const PROBE_MS = 8_000;

export const INTERRUPTED = 'The app was closed while this was being sent. Check in KH POS whether it went through, then Retry or Discard.';

/** Can this be sent again after an interruption without doing it twice? (Table, shift, checkout, retail and transfer changes are written to be repeated.) */
function isSafeToRepeat(c: OutboxCommand): boolean {
  if (c.kind !== 'record') return true;
  const p = c.payload as RecordPayload;
  return (p.op === 'update' || p.op === 'delete') && !p.once && !p.produce;
}

const isNetwork = (e: unknown) => e instanceof ApiError && e.kind === 'network';
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Keeps the changes made while kh-pos can't be reached and replays them, in order, when it can.
 *
 *  - `run` does a change online when kh-pos is reachable and nothing is waiting, and otherwise
 *    (or when the call fails because of the network) puts it in the outbox.
 *  - `flush` replays the outbox. A network failure stops it and keeps everything for next time;
 *    a rejection by kh-pos marks that one command "failed" (kept for the staff to retry or
 *    discard) and carries on; an expired login stops it without losing anything.
 *  - Every replay first looks at the table as it is on kh-pos now, so a command that already
 *    got through (the answer was lost) is not applied twice, and other people's changes made in
 *    the meantime are kept. kh-pos wins whenever the two disagree.
 */
export class SyncEngine {
  private state: EngineState = { online: true, syncing: false, commands: [], pending: 0, failed: 0, lastSyncedAt: null, syncVersion: 0 };
  private listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private posCache: { posInfo?: Awaited<ReturnType<KhPosApi['posInfo']>> } = {};

  constructor(
    private readonly api: EngineApi,
    private readonly store: LocalStore,
    private readonly now: () => number = Date.now,
    /** Opens the sealed bodies of queued changes that carry a secret. */
    private readonly secrets?: SecretBox,
  ) {}

  private uid: string | null = null;

  /** The signed-in staff member (null when signed out): only their changes are shown and replayed. */
  setUser(userId: string | null): void {
    this.uid = userId;
  }

  // ---- state ----

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): EngineState => this.state;

  private update(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Re-reads the outbox from the phone's database. */
  async refresh(): Promise<void> {
    const uid = this.uid;
    const all = await this.store.outboxList();
    // a change being sent right now is not shown: it is either about to be gone or about to be waiting
    const commands = uid ? all.filter((c) => c.userId === uid && c.status !== 'sending') : [];
    this.update({
      commands,
      pending: commands.filter((c) => c.status === 'pending').length,
      failed: commands.filter((c) => c.status === 'failed').length,
    });
  }

  /** Called with the result of every call to kh-pos (see OfflineData) and of the probe. */
  setOnline(online: boolean): void {
    if (online === this.state.online) return;
    this.update({ online });
    if (online && this.state.pending > 0) void this.flush();
  }

  // ---- changes ----

  /** Sends a command at once with the same code that replays it (for `run`, which has already written it to the database). */
  replayNow(cmd: NewCommand): Promise<void> {
    return this.replay({ ...cmd, status: 'sending', attempts: 0 } as OutboxCommand);
  }

  /** Commands being sent right now by this process (so a crash can tell its own leftovers from live sends). */
  private inFlight = new Set<string>();

  /**
   * Makes a change. It is written to the phone's database first (write-ahead); then, when kh-pos is reachable and no
   * earlier change is waiting (so order is kept), `tryOnline` sends it at once and it is removed. Otherwise it stays as
   * "pending" and is replayed later. Resolves 'done' or 'queued'. Errors that aren't network errors (kh-pos said no) are
   * thrown to the caller as before, and the change is not kept.
   */
  async run(cmd: NewCommand, tryOnline: () => Promise<void>): Promise<'done' | 'queued'> {
    const free = this.state.online && this.state.pending === 0 && !this.flushing;
    await this.store.outboxAdd({ ...cmd, status: free ? 'sending' : 'pending' });
    if (!free) {
      await this.refresh();
      if (this.state.online) void this.flush();
      return 'queued';
    }
    this.inFlight.add(cmd.id);
    try {
      await tryOnline();
      await this.store.outboxRemove(cmd.id);
      this.setOnline(true);
      await this.refresh();
      return 'done';
    } catch (e) {
      if (isNetwork(e)) {
        this.setOnline(false);
        await this.store.outboxUpdate(cmd.id, { status: 'pending' }); // replayed when kh-pos is back
        await this.refresh();
        return 'queued';
      }
      await this.store.outboxRemove(cmd.id); // kh-pos refused it: shown to the caller, not kept
      await this.refresh();
      throw e;
    } finally {
      this.inFlight.delete(cmd.id);
    }
  }

  /**
   * Like `run`, for a change that must not be done twice (stock in, receive ...). It is written first too, but sent at
   * once only when kh-pos answers a ping; if the answer to the send itself is lost nobody can tell whether it got
   * through, so it is NOT sent again by itself: it stays in the list as failed ("not confirmed") for the staff to check
   * first. Offline, it waits like any other change.
   */
  async runOnce(cmd: NewCommand, tryOnline: () => Promise<void>): Promise<'done' | 'queued'> {
    const free = this.state.online && this.state.pending === 0 && !this.flushing;
    if (free && !(await this.api.ping().catch(() => false))) {
      this.setOnline(false);
      await this.enqueue(cmd);
      return 'queued';
    }
    await this.store.outboxAdd({ ...cmd, status: free ? 'sending' : 'pending' });
    if (!free) {
      await this.refresh();
      if (this.state.online) void this.flush();
      return 'queued';
    }
    this.inFlight.add(cmd.id);
    try {
      await tryOnline();
      await this.store.outboxRemove(cmd.id);
      this.setOnline(true);
      await this.refresh();
      return 'done';
    } catch (e) {
      if (isNetwork(e)) {
        this.setOnline(false);
        await this.store.outboxUpdate(cmd.id, { status: 'failed', error: UNCONFIRMED });
        await this.refresh();
        throw new Error(UNCONFIRMED);
      }
      await this.store.outboxRemove(cmd.id);
      await this.refresh();
      throw e;
    } finally {
      this.inFlight.delete(cmd.id);
    }
  }

  /**
   * Called once when the app starts: a change left "sending" by an earlier run of the app (it was closed or crashed
   * mid-send). One that is safe to send again goes back to waiting; one that would be done twice if it had got through
   * is kept as failed ("not confirmed") for the staff to check.
   */
  async recoverSending(): Promise<void> {
    for (const c of await this.store.outboxList()) {
      if (c.status !== 'sending' || this.inFlight.has(c.id)) continue;
      if (isSafeToRepeat(c)) await this.store.outboxUpdate(c.id, { status: 'pending' });
      else await this.store.outboxUpdate(c.id, { status: 'failed', error: INTERRUPTED });
    }
    await this.refresh();
  }

  async enqueue(cmd: NewCommand): Promise<void> {
    await this.store.outboxAdd(cmd);
    await this.refresh();
    if (this.state.online) void this.flush();
  }

  async retry(id: string): Promise<void> {
    await this.store.outboxUpdate(id, { status: 'pending', error: null });
    await this.refresh();
    void this.flush();
  }

  async retryAll(): Promise<void> {
    for (const c of this.state.commands.filter((x) => x.status === 'failed')) await this.store.outboxUpdate(c.id, { status: 'pending', error: null });
    await this.refresh();
    void this.flush();
  }

  async discard(id: string): Promise<void> {
    await this.store.outboxRemove(id);
    await this.refresh();
  }

  // ---- replay ----

  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    this.update({ syncing: true });
    let changed = false;
    try {
      for (;;) {
        const waiting = (await this.store.outboxList()).filter((c) => c.userId === uid && c.status === 'pending');
        if (waiting.length === 0) break;
        let stop = false;
        for (const cmd of waiting) {
          try {
            await this.replay(cmd);
            await this.store.outboxRemove(cmd.id);
            changed = true;
            if (!this.state.online) this.update({ online: true });
          } catch (e) {
            if (isNetwork(e)) {
              this.update({ online: false });
              await this.store.outboxUpdate(cmd.id, { attempts: cmd.attempts + 1 });
              stop = true;
              break;
            }
            if (e instanceof ApiError && e.kind === 'unauthorized') {
              stop = true; // login expired: keep everything for after the next login
              break;
            }
            await this.store.outboxUpdate(cmd.id, { status: 'failed', error: messageOf(e), attempts: cmd.attempts + 1 });
            changed = true;
          }
        }
        if (stop) break;
      }
    } finally {
      await this.refresh();
      const done = this.state.pending === 0 && this.state.online;
      this.update({
        syncing: false,
        lastSyncedAt: done ? this.now() : this.state.lastSyncedAt,
        syncVersion: changed ? this.state.syncVersion + 1 : this.state.syncVersion,
      });
    }
  }

  private async replay(cmd: OutboxCommand): Promise<void> {
    switch (cmd.kind as CommandKind) {
      case 'addLine':
        return this.replayAddLine(cmd as OutboxCommand<'addLine'>);
      case 'setPending':
        return this.replaySetPending(cmd as OutboxCommand<'setPending'>);
      case 'removeLine':
        return this.replayRemoveLine(cmd as OutboxCommand<'removeLine'>);
      case 'setGuests':
        return this.replaySetGuests(cmd as OutboxCommand<'setGuests'>);
      case 'sendToKitchen':
        return this.replaySend(cmd as OutboxCommand<'sendToKitchen'>);
      case 'setStatus':
        return this.replayQty(cmd as OutboxCommand<'setStatus'>, (cmd.payload as SetStatusPayload).status);
      case 'moveStatus':
        return this.replayMove(cmd as OutboxCommand<'moveStatus'>);
      case 'serveAll':
        return this.replayServeAll(cmd as OutboxCommand<'serveAll'>);
      case 'setNote':
        return this.replayNote(cmd as OutboxCommand<'setNote'>);
      case 'setOption':
        return this.replayOption(cmd as OutboxCommand<'setOption'>);
      case 'setDiscount':
        return this.replayOnLine(cmd as OutboxCommand<'setDiscount'>, (order, id, p: SetDiscountPayload) =>
          this.api.setManualDiscount(order, { itemId: id, amount: p.amount, discountType: p.discountType }),
        );
      case 'setPromotion':
        return this.replayPromotion(cmd as OutboxCommand<'setPromotion'>);
      case 'openShift':
        return this.replayOpenShift(cmd as OutboxCommand<'openShift'>);
      case 'closeShift':
        return this.replayCloseShift(cmd as OutboxCommand<'closeShift'>);
      case 'checkout':
        return this.replayCheckout(cmd as OutboxCommand<'checkout'>);
      case 'transfer':
        return this.replayTransfer(cmd as OutboxCommand<'transfer'>);
      case 'retailSale':
        return this.replayRetailSale(cmd as OutboxCommand<'retailSale'>);
      case 'record':
        return this.replayRecord(cmd as OutboxCommand<'record'>);
      case 'resend':
        return this.replayOnLine(cmd as OutboxCommand<'resend'>, (_order, id, p: ResendPayload) => this.api.resendToKitchen(id, p.qty));
    }
  }

  /**
   * Finds the order line a command is about on kh-pos now (following the local-id map) and runs
   * `action` on it. Fails, to be shown as "needs attention", if the order or line is gone.
   */
  private async onLine<P extends { orderDetailId: string }, T>(
    cmd: OutboxCommand,
    p: P,
    action: (orderId: string, id: string, line: OrderLine) => Promise<T>,
  ): Promise<T> {
    const id = (await this.idMap())[p.orderDetailId] ?? p.orderDetailId;
    const order = (await this.api.table(cmd.tableId)).order;
    if (!order) throw new Error('The table has no open order any more.');
    const line = (order.items ?? []).find((l) => l.orderDetailId === id);
    if (!line) throw new Error('The item is not on the order any more.');
    return action(order.orderId, id, line);
  }

  private replayOnLine<K extends CommandKind>(cmd: OutboxCommand<K>, action: (orderId: string, id: string, payload: CommandPayloadOf<K>) => Promise<void>): Promise<void> {
    const p = cmd.payload as unknown as { orderDetailId: string };
    return this.onLine(cmd, p, (orderId, id) => action(orderId, id, cmd.payload as CommandPayloadOf<K>));
  }

  /**
   * Sends a saved setup change as it is. kh-pos' answer decides: a rejection makes the command "failed" for the
   * staff to see. An add that already got through (the answer was lost) is answered "already exists" and counts as done.
   */
  private async replayRecord(cmd: OutboxCommand<'record'>): Promise<void> {
    let p = cmd.payload;
    if (p.sealed) {
      if (!this.secrets) throw new Error('This saved change cannot be opened on this phone. Discard it and do it again.');
      const opened = JSON.parse(await this.secrets.open(p.sealed)) as Pick<RecordPayload, 'body' | 'steps'>;
      p = { ...p, body: opened.body, steps: opened.steps };
    }
    if (p.produce) {
      // the plan is made now from kh-pos' stock; a lost answer to the final call could mean it was made, so it is not repeated
      let posted = false;
      try {
        await planAndProduce(async (method, path, body) => {
          if (method === 'POST') posted = true;
          return this.api.call(method, path, body);
        }, p.produce);
      } catch (e) {
        if (posted && isNetwork(e)) throw new Error(UNCONFIRMED);
        throw e;
      }
      return;
    }
    const steps = p.steps && p.steps.length > 0 ? p.steps : [{ method: p.method, path: p.path, body: p.body }];
    let resultId = p.resultId;
    for (let i = p.done ?? 0; i < steps.length; i++) {
      const step = withResult(steps[i]!, resultId);
      try {
        const answer = (await this.api.call(step.method, step.path, step.body)) as Record<string, unknown> | undefined;
        if (p.mustBeTrue && answer && answer[p.mustBeTrue] === false) throw new Error('kh-pos did not accept it');
        resultId = resultOf(answer) ?? resultId;
      } catch (e) {
        // an add that already got through (the answer was lost) answers "already exists": that call is done
        if (!(p.op === 'create' && i === 0 && /duplicate entry[^]*PRIMARY|already exist/i.test(messageOf(e)))) {
          // the answer was lost: it may or may not have been applied, and doing it again could do it twice
          if (p.once && isNetwork(e)) throw new Error(UNCONFIRMED);
          throw e;
        }
      }
      if (steps.length > 1) {
        // carry on from the next call if this one is interrupted
        // (only the counter is saved: a sealed body stays sealed)
        cmd.payload = { ...cmd.payload, done: i + 1, resultId };
        await this.store.outboxUpdate(cmd.id, { payload: cmd.payload });
      }
    }
  }

  private async replayMove(cmd: OutboxCommand<'moveStatus'>): Promise<void> {
    const p: MoveStatusPayload = cmd.payload;
    await this.onLine(cmd, p, async (orderId, id, line) => {
      const now = statusQty(line, p.from);
      const b = p.baseline;
      if (b && now <= b.fromBefore - p.qty) return; // an earlier attempt already moved them
      if (!b) {
        cmd.payload = { ...p, baseline: { fromBefore: now } };
        await this.store.outboxUpdate(cmd.id, { payload: cmd.payload });
      }
      if (now < p.qty) throw new Error('There are not enough portions to move any more.');
      await this.api.moveStatus(orderId, [{ orderDetailId: id, fromStatus: p.from, toStatus: p.to, qty: p.qty }]);
    });
  }

  private async replayServeAll(cmd: OutboxCommand<'serveAll'>): Promise<void> {
    const order = (await this.api.table(cmd.tableId)).order;
    const moves = serveMoves(order);
    if (!order || moves.length === 0) return; // nothing preparing (already served)
    await this.api.moveStatus(order.orderId, moves);
  }

  private async replayNote(cmd: OutboxCommand<'setNote'>): Promise<void> {
    const p: SetNotePayload = cmd.payload;
    await this.onLine(cmd, p, async (orderId, id, line) => {
      const has = (line.orderModifiers ?? []).some((m) => m.modifierItemId === 'notes');
      if (has) await this.api.updateNote(orderId, { orderDetailId: id, notes: p.notes, price: p.price });
      else await this.api.addModifier(orderId, { orderDetailId: id, modifierItemId: 'notes', price: p.price, notes: p.notes });
    });
  }

  private async replayOption(cmd: OutboxCommand<'setOption'>): Promise<void> {
    const p: SetOptionPayload = cmd.payload;
    await this.onLine(cmd, p, async (orderId, id, line) => {
      const has = (line.orderModifiers ?? []).some((m) => m.modifierItemId === p.modifierItemId);
      if (p.on && !has) await this.api.addModifier(orderId, { orderDetailId: id, modifierItemId: p.modifierItemId, price: p.price });
      else if (!p.on && has) await this.api.removeModifier(orderId, { orderDetailId: id, modifierItemId: p.modifierItemId });
    });
  }

  /** The cashier's own open shift on kh-pos now, if any. */
  private async openShiftOf(userId: string) {
    const { data } = await this.api.shifts({ openedBy: userId, limit: 10 });
    return data.find((s) => s.status === 'OPEN' && s.opened_by?.id === userId) ?? null;
  }

  private async replayOpenShift(cmd: OutboxCommand<'openShift'>): Promise<void> {
    const p: OpenShiftPayload = cmd.payload;
    if (await this.openShiftOf(cmd.userId)) return; // already open (an earlier attempt got through)
    await this.api.openShift(p);
  }

  private async replayCloseShift(cmd: OutboxCommand<'closeShift'>): Promise<void> {
    const p: CloseShiftPayload = cmd.payload;
    const shift = await this.openShiftOf(cmd.userId);
    if (!shift) return; // already closed
    await this.api.closeShift({ shiftId: shift.shift_id, actualCashUsd: p.actualCashUsd, actualCashKhr: p.actualCashKhr });
  }

  private async replayCheckout(cmd: OutboxCommand<'checkout'>): Promise<void> {
    const p: CheckoutCommandPayload = cmd.payload;
    const order = (await this.api.table(cmd.tableId)).order;
    // No open order, or it is no longer a draft: it was already paid (an earlier attempt got through).
    if (!order || (order.orderStatus && order.orderStatus !== 'DRAFT')) return;
    this.posCache.posInfo ??= await this.api.posInfo(p.warehouseId);
    await this.api.checkout(order.orderId, { slotId: this.posCache.posInfo.posSlotId, payments: p.payments });
  }

  /**
   * Moves the whole order to the destination table. Works from kh-pos' own order and tables: an order already on the
   * destination is done; a destination that is taken now, or an order that is no longer on the table, is refused
   * (failed with the reason) rather than merged or split by surprise.
   */
  private async replayTransfer(cmd: OutboxCommand<'transfer'>): Promise<void> {
    const p: TransferPayload = cmd.payload;
    const destination = await this.api.table(p.destinationTableId);
    if (destination.order?.orderId === p.orderId) return; // an earlier try got through
    const source = await this.api.table(cmd.tableId);
    if (source.order?.orderId !== p.orderId) throw new Error('The order is no longer on this table.');
    if (destination.status === 'order_taken' || destination.order) throw new Error(`Table ${p.destinationName} has an order now. Move it from KH POS, or choose another table.`);
    const body = buildTransfer({
      orderId: p.orderId,
      sourceTableId: cmd.tableId,
      destinationTableId: p.destinationTableId,
      lines: source.order.items ?? [],
      selection: selectAll(source.order),
      transferDiscount: p.transferDiscount,
    });
    if (!body) throw new Error('Nothing to move.');
    await this.api.transferTable(body);
  }

  /**
   * A Retail POS sale: opens the order (with the id made on the phone) and pays it. Safe to repeat: an order that is
   * already paid is done, one that is open only gets paid, and opening it again hits the same id.
   */
  private async replayRetailSale(cmd: OutboxCommand<'retailSale'>): Promise<void> {
    const p: RetailSalePayload = cmd.payload;
    const existing = await this.api.orderDetail(p.orderId).catch((e) => {
      if (e instanceof ApiError && e.kind === 'network') throw e;
      return null; // kh-pos has no such order yet
    });
    this.posCache.posInfo ??= await this.api.posInfo(p.warehouseId);
    const info = this.posCache.posInfo;
    if (existing) {
      if (existing.orderInfo.orderStatus && existing.orderInfo.orderStatus !== 'DRAFT') return; // already paid
    } else {
      const short = (await this.api.stockToTransfer(p.cart.map((l) => ({ variantId: l.variantId, toFindQty: l.qty })))).filter((x) => x.slot && x.slot.posSlot === false);
      if (short.length > 0) throw new Error('Some products are not in the POS slot. Move the stock to the POS slot, then Retry.');
      const invoiceNo = await this.api.nextInvoiceNumber();
      try {
        await this.api.createRetailOrder(retailOrderBody({ warehouseId: p.warehouseId, slotId: info.posSlotId, customerId: info.posCustomerId, invoiceNo, orderId: p.orderId }, p.cart));
      } catch (e) {
        if (!(e instanceof ApiError && /duplicate/i.test(e.message) && /primary/i.test(e.message))) throw e; // an earlier try opened it
      }
    }
    await this.api.checkout(p.orderId, { slotId: info.posSlotId, payments: p.payments });
  }

  private async replayPromotion(cmd: OutboxCommand<'setPromotion'>): Promise<void> {
    const p: SetPromotionPayload = cmd.payload;
    await this.onLine(cmd, p, async (orderId, id, line) => {
      const has = (line.discounts ?? []).some((d) => d.discountId === p.discountId);
      if (p.on && !has) await this.api.addPromotion(orderId, { itemId: id, discountId: p.discountId });
      else if (!p.on && has) await this.api.removePromotion(orderId, { itemId: id, discountId: p.discountId });
    });
  }

  /** Local line id → the line it really is on kh-pos (they differ when a dish was merged). */
  private async idMap(): Promise<Record<string, string>> {
    return (await this.store.getCache<Record<string, string>>(ID_MAP_KEY))?.value ?? {};
  }

  private async mapId(local: string, real: string): Promise<void> {
    if (local === real) return;
    await this.store.setCache(ID_MAP_KEY, { ...(await this.idMap()), [local]: real });
  }

  private async replayAddLine(cmd: OutboxCommand<'addLine'>): Promise<void> {
    const p: AddLinePayload = cmd.payload;
    const fresh = await this.api.table(cmd.tableId);
    const note = p.note.trim();

    // Already there: an earlier attempt got through but its answer was lost. Only make sure the
    // options and note made it too.
    const existing = (fresh.order?.items ?? []).find((l) => l.orderDetailId === p.lineId);
    if (existing && fresh.order) {
      const have = new Set((existing.orderModifiers ?? []).map((m) => m.modifierItemId));
      const missing = p.options.filter((o) => !have.has(o.id));
      await addExtras(this.api, fresh.order.orderId, p.lineId, missing, have.has('notes') ? '' : note);
      return;
    }

    const plain = p.options.length === 0 && !note;
    const target = plain ? mergeTarget(fresh.order, p.product, p.capEnabled) : null;
    if (target) {
      const b = p.baseline;
      if (b && b.targetId === target.orderDetailId && pendingQty(target) >= b.pendingBefore + p.qty) {
        await this.mapId(p.lineId, target.orderDetailId); // an earlier attempt already raised it
        return;
      }
      if (!b || b.targetId !== target.orderDetailId) {
        cmd.payload = { ...p, baseline: { targetId: target.orderDetailId, pendingBefore: pendingQty(target) } };
        await this.store.outboxUpdate(cmd.id, { payload: cmd.payload });
      }
    }

    const id = await addToTable(
      this.api,
      { table: fresh, warehouseId: p.warehouseId, product: p.product as MenuProduct, qty: p.qty, options: p.options, note, capEnabled: p.capEnabled },
      () => p.lineId,
      this.posCache,
    );
    await this.mapId(p.lineId, id);
  }

  private replaySetPending(cmd: OutboxCommand<'setPending'>): Promise<void> {
    return this.replayQty(cmd, 'pending');
  }

  /**
   * Sets the portions of a line in one status. When the phone knew the count it saw (`base`), the change is the
   * difference from it applied to kh-pos' count now, so what someone else did meanwhile is kept; the result is
   * remembered (`target`) so a retry after a lost answer sets the same number instead of applying the difference again.
   */
  private async replayQty(cmd: OutboxCommand<'setPending' | 'setStatus'>, status: 'pending' | 'cooking' | 'served'): Promise<void> {
    const p: SetPendingPayload = cmd.payload;
    await this.onLine(cmd, p, async (orderId, id, line) => {
      let qty = p.qty;
      if (p.base !== undefined) {
        qty = p.target ?? Math.max(0, statusQty(line, status) + p.qty - p.base);
        if (p.target === undefined) {
          cmd.payload = { ...p, target: qty };
          await this.store.outboxUpdate(cmd.id, { payload: cmd.payload });
        }
      }
      await this.api.setStatusQty(orderId, id, status, qty);
    });
  }

  private async replayRemoveLine(cmd: OutboxCommand<'removeLine'>): Promise<void> {
    const p: RemoveLinePayload = cmd.payload;
    const id = (await this.idMap())[p.orderDetailId] ?? p.orderDetailId;
    const order = (await this.api.table(cmd.tableId)).order;
    if (!order || !(order.items ?? []).some((l) => l.orderDetailId === id)) return; // already gone
    await this.api.removeLine(order.orderId, id);
  }

  private async replaySetGuests(cmd: OutboxCommand<'setGuests'>): Promise<void> {
    const p: SetGuestsPayload = cmd.payload;
    const order = (await this.api.table(cmd.tableId)).order;
    if (!order) throw new Error('The table has no open order any more.');
    await this.api.setGuests(order.orderId, p.count);
  }

  private async replaySend(cmd: OutboxCommand<'sendToKitchen'>): Promise<void> {
    const order = (await this.api.table(cmd.tableId)).order;
    const moves = kitchenMoves(order);
    if (!order || moves.length === 0) return; // nothing pending (already sent)
    await this.api.sendToKitchen(order.orderId, moves);
  }

  // ---- background ----

  /** Starts checking for kh-pos every few seconds while something is waiting or it's offline. */
  start(): void {
    if (this.timer) return;
    void this.recoverSending().then(() => this.tick());
    this.timer = setInterval(() => void this.tick(), PROBE_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One check: is kh-pos there, and if so send what is waiting. Also what "Sync now" does. */
  async tick(): Promise<void> {
    if (!this.uid) return;
    await this.refresh();
    if (this.state.online && this.state.pending === 0) return;
    const ok = await this.api.ping();
    this.setOnline(ok);
    if (ok && this.state.pending > 0) await this.flush();
  }
}
