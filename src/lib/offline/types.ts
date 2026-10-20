import type { CheckoutPayment, MenuProduct, ModifierItem } from '../api';
import type { Receipt } from '../receipt';

/**
 * Offline support, in short:
 *  - Reads go to kh-pos and are copied into a local cache; when kh-pos can't be reached the
 *    cache is shown instead (data.ts).
 *  - Every change the app can make (add a dish, quantities, Prepare and Serve, options, notes,
 *    discounts, promotions, guests, send to kitchen, resend) is kept in a local outbox when
 *    kh-pos can't be reached, shown on screen at once (overlay.ts) and replayed in order later
 *    (engine.ts).
 *  - kh-pos stays the only source of truth: if replaying fails for a reason other than the
 *    network, the change is kept as "failed" for the staff to retry or discard.
 */

export type CommandKind =
  | 'addLine'
  | 'setPending'
  | 'removeLine'
  | 'setGuests'
  | 'sendToKitchen'
  // Customize Your Order
  | 'setStatus'
  | 'moveStatus'
  | 'serveAll'
  | 'setNote'
  | 'setOption'
  | 'setDiscount'
  | 'setPromotion'
  | 'resend'
  // Shift and checkout
  | 'openShift'
  | 'closeShift'
  | 'checkout'
  // Setup records (category, supplier, ...): one saved change to a screen's list, sent as it is
  | 'record';

/** The dish fields a replay needs (trimmed copy of the menu row). */
export type ProductSnapshot = Pick<MenuProduct, 'productId' | 'variantId' | 'productTitle' | 'price' | 'discountedPrice'>;

export interface AddLinePayload {
  /** Order line id, made on the phone: the same id is used for every retry. */
  lineId: string;
  product: ProductSnapshot;
  qty: number;
  options: ModifierItem[];
  note: string;
  warehouseId: string;
  /** Branch "max quantity per line" discount cap (see mergeTarget). */
  capEnabled: boolean;
  /**
   * Set by the first replay attempt: the line the dish was merged into and how many portions
   * were pending then, so a retry after a lost answer doesn't add the portions twice.
   */
  baseline?: { targetId: string; pendingBefore: number };
}

export interface SetPendingPayload {
  orderDetailId: string;
  qty: number;
}

export interface RemoveLinePayload {
  orderDetailId: string;
}

export interface SetGuestsPayload {
  count: number;
}

/** Sets how many portions of a line are in one status (Quantity Management edit). */
export interface SetStatusPayload {
  orderDetailId: string;
  status: 'pending' | 'cooking' | 'served';
  qty: number;
}

/** Prepare (pending → cooking) or Serve (cooking → served) for part or all of a line. */
export interface MoveStatusPayload {
  orderDetailId: string;
  from: 'pending' | 'cooking';
  to: 'cooking' | 'served';
  qty: number;
  /** Set by the first replay attempt: portions in `from` then, so a lost answer doesn't move them twice. */
  baseline?: { fromBefore: number };
}

export interface SetNotePayload {
  orderDetailId: string;
  notes: string;
  /** Extra charge for the note. */
  price: number;
}

export interface SetOptionPayload {
  orderDetailId: string;
  modifierItemId: string;
  /** Shown name and price, for the on-screen copy of the order. */
  name: string;
  price: number;
  on: boolean;
}

export interface SetDiscountPayload {
  orderDetailId: string;
  amount: number;
  discountType: 'PERCENTAGE' | 'AMOUNT';
}

export interface SetPromotionPayload {
  orderDetailId: string;
  discountId: string;
  /** Shown name, for the on-screen copy of the order. */
  name: string;
  on: boolean;
}

export interface ResendPayload {
  orderDetailId: string;
  qty: number;
}

export interface OpenShiftPayload {
  openedCashUsd: number;
  openedCashKhr: number;
  exchangeRate: number;
}

/** Closes the cashier's open shift (found when it is sent, as it may have been opened offline too). */
export interface CloseShiftPayload {
  actualCashUsd: number;
  actualCashKhr: number;
}

/** Pays and completes a table's order. */
export interface CheckoutCommandPayload {
  payments: CheckoutPayment[];
  warehouseId: string;
  /** Kept so a receipt can be shown for a payment that has not reached kh-pos yet. */
  receipt: Receipt;
}

/**
 * A change to a record of a setup screen (add, edit or delete a category, a supplier, a setting ...). It holds the
 * request to send as it is; `row` is the copy shown on screen until it has been sent.
 */
export interface RecordPayload {
  /** Which list it belongs to, e.g. 'category'. */
  entity: string;
  /** `action` is anything else done to a record (approve, receive, stock in ...); with a `row` it also shows on the list. */
  op: 'create' | 'update' | 'delete' | 'action';
  /** Id of the record (made on the phone for an add). */
  recordId: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** Name shown in the sync list. */
  label: string;
  /**
   * Sending it twice would do it twice (stock in, receive, add with an id kh-pos makes). Such a change is only sent when
   * kh-pos is known to be reachable, and if the answer is lost it is not sent again by itself: it is kept as failed
   * ("not confirmed") for the staff to check first.
   */
  once?: boolean;
  /** The record as it should look on screen (add and edit). */
  row?: Record<string, unknown>;
}

export type CommandPayload = {
  addLine: AddLinePayload;
  setPending: SetPendingPayload;
  removeLine: RemoveLinePayload;
  setGuests: SetGuestsPayload;
  sendToKitchen: Record<string, never>;
  setStatus: SetStatusPayload;
  moveStatus: MoveStatusPayload;
  serveAll: Record<string, never>;
  setNote: SetNotePayload;
  setOption: SetOptionPayload;
  setDiscount: SetDiscountPayload;
  setPromotion: SetPromotionPayload;
  resend: ResendPayload;
  openShift: OpenShiftPayload;
  closeShift: CloseShiftPayload;
  checkout: CheckoutCommandPayload;
  record: RecordPayload;
};

export interface OutboxCommand<K extends CommandKind = CommandKind> {
  id: string;
  /** Staff member who made the change; only their phone session replays it. */
  userId: string;
  kind: K;
  tableId: string;
  payload: CommandPayload[K];
  status: 'pending' | 'failed';
  /** Why a failed command failed (kh-pos' message). */
  error?: string | null;
  attempts: number;
  /** ms since epoch, phone clock (display only). */
  createdAt: number;
  /** Order in the outbox, set by the store. */
  seq?: number;
}

export type NewCommand<K extends CommandKind = CommandKind> = Omit<OutboxCommand<K>, 'seq' | 'attempts' | 'status' | 'error'> & {
  status?: 'pending';
};

export interface CachedValue<T> {
  value: T;
  /** ms since epoch when it was saved. */
  savedAt: number;
}

/** Everything the app keeps on the phone. SQLite in the app, memory in tests. */
export interface LocalStore {
  getCache<T>(key: string): Promise<CachedValue<T> | null>;
  setCache(key: string, value: unknown): Promise<void>;
  deleteCache(key: string): Promise<void>;

  outboxAdd(cmd: NewCommand): Promise<void>;
  /** All commands, oldest first. */
  outboxList(): Promise<OutboxCommand[]>;
  outboxUpdate(id: string, patch: Partial<Pick<OutboxCommand, 'status' | 'error' | 'attempts' | 'payload'>>): Promise<void>;
  outboxRemove(id: string): Promise<void>;
}
