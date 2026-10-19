import type { MenuProduct, ModifierItem } from '../api';

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
  | 'resend';

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
