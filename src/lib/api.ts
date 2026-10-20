/**
 * kh-pos API client for staff, using the same endpoints as the kh-pos web app.
 * Response shapes are copied from the kh-pos sources; only the fields the app uses are typed.
 */

import { getDeviceHeaders } from './device-headers';
import { parseCleanEvents, type CleanEvent } from './clean-dummy';
import type { PromotionSet, PromotionSlot } from './promotion-set';
import { stripSecrets } from './redact';
import { orderQuery, type OrderFilter, type OrderRow, type ReturnInput } from './orders';
import type { TransferBody } from './transfer';

export type ApiErrorKind =
  | 'notConfigured' // the app was started without EXPO_PUBLIC_KHPOS_URL
  | 'network' // no connection, wrong server address, timeout
  | 'invalidCredentials' // wrong username or password
  | 'offlineNoAccount' // server unreachable and this phone has no saved login for that name
  | 'locked' // too many wrong passwords typed offline; wait a minute
  | 'unauthorized' // token no longer valid
  | 'forbidden'
  | 'server'; // anything else

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status?: number,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'ApiError';
  }
}

export type FetchFn = typeof fetch;

/** GET /api/user/me (kh-pos UserInfo). */
export interface StaffUser {
  id: string;
  username: string;
  fullname: string | null;
  currentWarehouseId: string | null;
  warehouse: { id: string; name: string; isMain?: boolean } | null;
  /** permissions: resource → "create,read,update" (null for roles without a list, e.g. OWNER). */
  role: { role: string; permissions?: Record<string, string | string[]> | null } | null;
}

export interface Setting {
  option: string;
  value: string | null;
  /** Branch the row is for; null for the global default. */
  warehouse?: string | null;
}

export interface Category {
  id: string;
  title: string;
  forSaleCount?: number;
}

export interface ModifierItem {
  id: string;
  modifierId: string;
  name: string;
  price?: number | string;
}

export interface ModifierGroup {
  modifierId: string;
  title: string;
  items?: ModifierItem[];
}

export interface MenuProduct {
  productId: string;
  variantId: string;
  /** "Product (Variant)". */
  productTitle: string;
  price?: number | string;
  discountedPrice?: number | null;
  images?: { url: string; imageOrder: number | null }[];
  category?: { id: string; title: string } | null;
  modifiers?: ModifierGroup[] | null;
}

export type TableStatus = 'available' | 'order_taken' | 'cleaning';
export type ItemStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

/** One line of an order (kh-pos OrderDetail). */
export interface OrderLine {
  orderDetailId: string;
  variantId: string;
  /** "Product (Variant)". */
  title: string;
  qty: number;
  price: string;
  /** Discount on the whole line, worked out by kh-pos. */
  discountAmount?: string;
  /** Options and paid notes on the whole line (kh-pos spelling). */
  modiferAmount?: string;
  totalAmount: string;
  /** When the line was added, branch local time "YYYY-MM-DD HH:mm:ss". */
  createdAt?: string | null;
  status?: {
    status: ItemStatus;
    qty: number;
    /** When this status count last changed, "YYYY-MM-DD HH:mm". */
    createdAt?: string | null;
    createdBy?: { fullname?: string | null; username?: string | null } | null;
  }[];
  orderModifiers?: { orderDetailId: string; modifierItemId: string; price?: number; notes?: string | null }[];
  discounts?: LineDiscount[];
  /**
   * One entry per kitchen ticket printed for the line (print_kitchen_log). printedAt is the
   * real "sent to kitchen" time; kh-pos never overwrites it.
   */
  kitchenLogs?: { printedAt: string | null }[];
  /** One entry per "Resend to Kitchen" (who, how many portions), oldest first. */
  kitchenResends?: { by: string; qty: number; resentAt: string }[];
  /** Dish data kh-pos sends with the lines of a finished order (option names). */
  productVariant?: { basicProduct?: { modifiers?: ModifierGroup[] | null } | null } | null;
  /** Returns already made on this line (finished orders). */
  orderReturns?: { id?: string; quantity: number; refundAmount?: number | string; reason?: string; status?: string; returnedAt?: string }[];
  /** App only: made offline and not in kh-pos yet (see lib/offline/overlay.ts). */
  localOnly?: boolean;
}

export interface LineDiscount {
  /** "manual" for the manual discount, otherwise the kh-pos discount id. */
  discountId: string;
  name: string;
  discountType?: 'PERCENTAGE' | 'AMOUNT';
  value?: number;
  isManualDiscount?: boolean;
  /** Money off on the line from this discount. */
  amount?: number;
}

/** A discount that can be applied to a product (GET /api/discount/applies). */
export interface PromotionOption {
  discountId: string;
  discount?: { title?: string; discountType?: 'PERCENTAGE' | 'AMOUNT'; value?: number } | null;
}

export type CountableStatus = 'pending' | 'cooking' | 'served';

export interface StatusMove {
  orderDetailId: string;
  fromStatus: 'pending' | 'cooking';
  toStatus: 'cooking' | 'served';
  qty: number;
}

/** A table's open (DRAFT) order. kh-pos sends camelCase aliases next to the raw columns. */
export interface TableOrder {
  orderId: string;
  invoiceNo: number | string;
  totalAmount: string;
  /** Number of guests at the table (web: 👤 button). */
  customer?: number | null;
  items?: OrderLine[];
  /** DRAFT while open; COMPLETED once paid (kh-pos). */
  orderStatus?: string;
  /** dine_in, take_away, food_delivery (or customer for an order the customer made). */
  servedType?: string | null;
  /** Payments already recorded on the order. */
  payments?: PaymentRow[];
  /** App only: the order was started offline and has no kh-pos order or invoice number yet. */
  localOnly?: boolean;
}

/** A payment on an order (kh-pos Payment). */
export interface PaymentRow {
  paymentId?: string;
  paymentMethod: string;
  amount: number | string;
  currency: 'USD' | 'KHR';
  amountUsd?: number | string;
  exchangeRate?: number | string;
  used?: number | string;
}

/** One payment line sent when checking out. Numbers, as kh-pos's schema wants. */
export interface CheckoutPayment {
  amount: number;
  paymentMethod: string;
  currency: 'USD' | 'KHR';
  amountUsd: number;
  exchangeRate: number;
  used: number;
}

export interface PaymentMethod {
  method_id: string;
  method: string | null;
  created_at?: string | null;
}

/** Shift of a cashier (GET /api/shift). */
export interface ShiftReceipt {
  shiftId?: string;
  employee?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  orders: number;
  sales: number;
  payments: number;
  exchangeRate?: string | number | null;
  openedCashUsd: number;
  openedCashKhr: number;
  closedCashUsd: number;
  closedCashKhr: number;
  actualCashUsd: number;
  actualCashKhr: number;
  cashDiffUsd: number;
  cashDiffKhr: number;
  amountByMethod: Record<string, { usd: number; khr: number; qty: number }>;
  amountReturned: number;
  returns: number;
  totalCustomer: number;
  avgCustomer: number;
}

export interface Shift {
  shift_id: string;
  status: 'OPEN' | 'CLOSE';
  opened_at: string | null;
  closed_at: string | null;
  opened_cash_usd: string | null;
  opened_cash_khr: string | null;
  closed_cash_usd?: string | null;
  closed_cash_khr?: string | null;
  actual_cash_usd?: string | null;
  actual_cash_khr?: string | null;
  exchange_rate?: string | null;
  opened_by: { id: string; fullname?: string | null; username?: string | null } | null;
  closed_by?: { id: string; fullname?: string | null; username?: string | null } | null;
  /** The live summary for an open shift; the saved one (an object, or JSON text) for a closed one. */
  receipt?: ShiftReceipt | string | null;
}

/** GET /api/pos/order/:id. Only the fields the receipt uses are typed. */
export interface OrderDetailResult {
  orderInfo: {
    orderId: string;
    invoiceNo?: number | string | null;
    totalAmount?: string | number | null;
    customer?: number | null;
    paidAt?: string | null;
    createdAt?: string | null;
    orderStatus?: string | null;
    tableNumber?: string | null;
    tableName?: string | null;
    servedType?: string | null;
    deliveryCode?: string | null;
    createdBy?: { fullname?: string | null; username?: string | null } | null;
  };
  orderDetail: OrderLine[];
  payments: PaymentRow[];
}

export interface RestaurantTable {
  id: string;
  table_name: string;
  setting_capacity: number | null;
  section: string | null;
  status: TableStatus;
  order: TableOrder | null;
  table_shape?: string | null;
  location_description?: string | null;
  /** Comma separated features ("window, quiet"). */
  special_features?: string | null;
  addional_notes?: string | null;
  /** Floor plan position (text), when one was saved. */
  position_x?: string | null;
  position_y?: string | null;
  /** App only: changes made on this phone that kh-pos hasn't received yet. */
  pendingSync?: number;
}

/** The table form of kh-pos (create and edit). */
export interface TableInput {
  tableNumber: string;
  seatingCapacity: number;
  section: string;
  tableShape: string;
  locationDescription?: string;
  features: string[];
  additionalNotes?: string;
}

export interface PosInfo {
  posSlotId: string;
  posCustomerId: string;
}

export interface NewLine {
  /** Order line id, generated on the phone. */
  id: string;
  variantId: string;
  qty: number;
  /** Unit price. Staff orders are priced by the app, like the kh-pos web POS. */
  price: number;
}

export interface KitchenMove {
  orderDetailId: string;
  fromStatus: 'pending';
  toStatus: 'cooking';
  qty: number;
}

export interface MenuQuery {
  warehouse: string;
  search?: string;
  /** Category id, or empty for all. */
  categoryId?: string;
  limit: number;
  offset: number;
}

export class KhPosApi {
  constructor(
    readonly baseUrl: string,
    private readonly getToken: () => string | null,
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  /** The login token, for the one place that needs to hand it to a page of kh-pos itself (the invoice preview). */
  get token(): string | null {
    return this.getToken();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) throw new ApiError('notConfigured', undefined, 'No server address (EXPO_PUBLIC_KHPOS_URL)');
    const headers: Record<string, string> = { ...getDeviceHeaders() };
    // kh-pos parses a body only when Content-Type is exactly "application/json", and fails on
    // GET requests that declare JSON without a body: send the header only with a body.
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      throw new ApiError('network', undefined, e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }

    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new ApiError('server', res.status, 'Unexpected response from server');
    }
    const message = typeof json.error === 'string' ? json.error : undefined;
    if (res.status === 401) throw new ApiError('unauthorized', 401, message);
    if (res.status === 403) throw new ApiError('forbidden', 403, message);
    if (!res.ok || json.success === false) throw new ApiError('server', res.status, message);
    // the login answer is the one place a token is wanted; everywhere else other people's tokens are dropped
    return (path === '/api/auth/login' ? json : stripSecrets(json)) as T;
  }

  /**
   * Runs "Clean up dummy data" (`POST /api/setting/clean`) and hands over each progress event as it arrives (the
   * answer is a stream, which the ordinary request cannot read piece by piece). Throws if kh-pos can't be reached
   * or refuses; a stream that ends without a final event is for the caller to call a failure.
   */
  async cleanDummy(onEvent: (e: CleanEvent) => void): Promise<void> {
    if (!this.baseUrl) throw new ApiError('notConfigured', undefined, 'No server address (EXPO_PUBLIC_KHPOS_URL)');
    const { fetch: streamFetch } = await import('expo/fetch');
    const headers: Record<string, string> = { ...getDeviceHeaders(), 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Awaited<ReturnType<typeof streamFetch>>;
    try {
      res = await streamFetch(`${this.baseUrl}/api/setting/clean`, { method: 'POST', headers, body: '{}' });
    } catch (e) {
      throw new ApiError('network', undefined, e instanceof Error ? e.message : String(e));
    }
    if (res.status === 401) throw new ApiError('unauthorized', 401);
    if (res.status === 403) throw new ApiError('forbidden', 403);
    if (!res.ok || !res.body) throw new ApiError('server', res.status, 'Unexpected response from server');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        throw new ApiError('network', undefined, e instanceof Error ? e.message : String(e));
      }
      if (chunk.done) break;
      const parsed = parseCleanEvents(buffer + decoder.decode(chunk.value, { stream: true }));
      buffer = parsed.rest;
      for (const e of parsed.events) onEvent(e);
    }
  }

  /**
   * Whether kh-pos answers at all: any HTTP response counts (even 401 or a redirect), only a
   * failed connection or a timeout doesn't. Needs no login, and works on a LAN with no internet.
   */
  async ping(timeoutMs = 5_000): Promise<boolean> {
    if (!this.baseUrl) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await this.fetchFn(`${this.baseUrl}/api/user/me`, { method: 'GET', signal: controller.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Any kh-pos call, for the modules that keep their own typed wrappers (see lib/modules/). Same
   * rules as every other call: the login token is sent, network and HTTP errors become ApiErrors.
   */
  call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request<T>(method, path, body);
  }

  /** Staff login. kh-pos answers a wrong password with HTTP 200 and `{ error }`. */
  async login(username: string, password: string): Promise<string> {
    const json = await this.request<{ token?: string; error?: string }>('POST', '/api/auth/login', { username, password });
    if (!json.token) throw new ApiError('invalidCredentials', 200, json.error);
    return json.token;
  }

  async me(): Promise<StaffUser> {
    const json = await this.request<{ user?: StaffUser }>('GET', '/api/user/me');
    if (!json.user) throw new ApiError('unauthorized', 401);
    return json.user;
  }

  async settings(warehouseId: string): Promise<Setting[]> {
    const json = await this.request<{ result?: Setting[] }>('GET', `/api/setting?warehouseId=${encodeURIComponent(warehouseId)}`);
    return json.result ?? [];
  }

  async categories(warehouseId: string): Promise<Category[]> {
    const json = await this.request<{ result?: { data: Category[] } }>(
      'GET',
      `/api/category/menu?warehouse=${encodeURIComponent(warehouseId)}`,
    );
    return json.result?.data ?? [];
  }

  /** Same query as the kh-pos web menu (product-list.tsx). */
  async menu(q: MenuQuery): Promise<MenuProduct[]> {
    const params = new URLSearchParams({
      search: (q.search ?? '').toLowerCase().trim(),
      limit: String(q.limit),
      offset: String(q.offset),
      replenishment: 'false',
      compositeOnly: 'false',
      categoryKeys: q.categoryId ?? '',
      warehouse: q.warehouse,
      type: 'pos',
    });
    const json = await this.request<{ result?: MenuProduct[] }>('GET', `/api/product-v2/menu?${params.toString()}`);
    return json.result ?? [];
  }

  // ---- tables & orders (same calls as the kh-pos web restaurant POS) ----

  /** All tables of the staff member's branch, each with its open order. */
  async tables(): Promise<RestaurantTable[]> {
    const json = await this.request<{ result?: RestaurantTable[] }>('GET', '/api/table');
    return json.result ?? [];
  }

  async table(id: string): Promise<RestaurantTable> {
    const json = await this.request<{ result?: RestaurantTable }>('GET', `/api/table/${encodeURIComponent(id)}`);
    if (!json.result?.id) throw new ApiError('server', 404, 'Table not found');
    return json.result;
  }

  async setTableStatus(id: string, status: TableStatus): Promise<void> {
    await this.request('PUT', `/api/table/${encodeURIComponent(id)}`, { status });
  }

  async posInfo(warehouseId: string): Promise<PosInfo> {
    const json = await this.request<{ result?: PosInfo }>('GET', `/api/pos/info?warehouse=${encodeURIComponent(warehouseId)}`);
    if (!json.result) throw new ApiError('server', undefined, 'No POS slot or walk-in customer for this branch');
    return json.result;
  }

  async nextInvoiceNumber(): Promise<number> {
    const json = await this.request<{ result?: number[] }>('GET', '/api/pos/auto_invoice_number?n=1');
    const n = Number(json.result?.[0]);
    if (!n) throw new ApiError('server', undefined, 'No invoice number (check the branch invoice receipt setting)');
    return n;
  }

  /** Opens the table's order with its first line. Returns the order id. */
  async createOrder(input: { warehouseId: string; tableId: string; posInfo: PosInfo; invoiceNo: number; line: NewLine }): Promise<string> {
    const json = await this.request<{ result?: string }>('POST', '/api/pos/order', {
      warehouseId: input.warehouseId,
      slotId: input.posInfo.posSlotId,
      customerId: input.posInfo.posCustomerId,
      invoiceNo: input.invoiceNo,
      tableNumber: input.tableId,
      items: [{ id: input.line.id, variantId: input.line.variantId, qty: input.line.qty, price: String(input.line.price) }],
    });
    if (!json.result) throw new ApiError('server', undefined, 'No order id returned');
    return json.result;
  }

  async addLine(orderId: string, line: NewLine): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/add-item`, {
      id: line.id,
      variantId: line.variantId,
      qty: line.qty,
      price: String(line.price),
      discountAmount: '0',
    });
  }

  /** Adds a modifier option, or a free-text note with modifierItemId "notes", to a line. */
  async addModifier(orderId: string, input: { orderDetailId: string; modifierItemId: string; price: number; notes?: string }): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/modifier`, input);
  }

  /** Sets how many portions of a line are still pending (not sent to the kitchen). */
  setPendingQty(orderId: string, orderDetailId: string, qty: number): Promise<void> {
    return this.setStatusQty(orderId, orderDetailId, 'pending', qty);
  }

  /** Sets the number of portions of a line in one status (web: Quantity Management edit). */
  async setStatusQty(orderId: string, orderDetailId: string, status: CountableStatus, qty: number): Promise<void> {
    await this.request('PUT', `/api/pos/order/${encodeURIComponent(orderId)}/update-item-status`, { orderDetailId, status, qty });
  }

  /** Moves portions between statuses: pending → cooking ("Prepare"), cooking → served ("Serve"). */
  async moveStatus(orderId: string, moves: StatusMove[]): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/update-item-status`, moves);
  }

  async removeModifier(orderId: string, input: { orderDetailId: string; modifierItemId: string }): Promise<void> {
    await this.request('DELETE', `/api/pos/order/${encodeURIComponent(orderId)}/modifier`, input);
  }

  /** Changes the line's existing note (special instructions) and its extra charge. */
  async updateNote(orderId: string, input: { orderDetailId: string; notes: string; price: number }): Promise<void> {
    await this.request('PUT', `/api/pos/order/${encodeURIComponent(orderId)}/modifier`, { ...input, modifierItemId: 'notes' });
  }

  async setManualDiscount(orderId: string, input: { itemId: string; amount: number; discountType: 'PERCENTAGE' | 'AMOUNT' }): Promise<void> {
    await this.request('PUT', `/api/pos/order/${encodeURIComponent(orderId)}/promotion`, [input]);
  }

  /** Promotion sets running (or waiting for their happy hour) at this branch. */
  async promotionSets(warehouseId: string): Promise<PromotionSet[]> {
    const json = await this.request<{ result?: PromotionSet[] }>('GET', `/api/promotion-set/active?warehouseId=${encodeURIComponent(warehouseId)}`);
    return json.result ?? [];
  }

  /** The menu products that can fill each slot of a set. Refused with 409 "notActive" outside its hours. */
  async promotionChoices(id: string): Promise<PromotionSlot[]> {
    const json = await this.request<{ result?: PromotionSlot[] }>('GET', `/api/promotion-set/${encodeURIComponent(id)}/choices`);
    return json.result ?? [];
  }

  async promotionsFor(productId: string): Promise<PromotionOption[]> {
    const json = await this.request<{ result?: PromotionOption[] }>('GET', `/api/discount/applies?productId=${encodeURIComponent(productId)}`);
    return json.result ?? [];
  }

  async addPromotion(orderId: string, input: { itemId: string; discountId: string }): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/promotion`, input);
  }

  async removePromotion(orderId: string, input: { itemId: string; discountId: string }): Promise<void> {
    await this.request('DELETE', `/api/pos/order/${encodeURIComponent(orderId)}/promotion`, input);
  }

  /** Number of guests at the table. */
  async setGuests(orderId: string, customer: number): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/customer`, { customer });
  }

  async removeLine(orderId: string, orderDetailId: string): Promise<void> {
    await this.request('DELETE', `/api/pos/order/${encodeURIComponent(orderId)}/remove-item`, { item_id: orderDetailId });
  }

  // ---- shift, payment, checkout ----

  /** Shifts, newest first. With `openedBy` only that person's (an OWNER sees everyone's regardless). */
  async shifts(q: { openedBy?: string; limit?: number; offset?: number } = {}): Promise<{ total: number; data: Shift[] }> {
    const params = new URLSearchParams();
    if (q.openedBy) params.set('openedBy', q.openedBy);
    params.set('limit', String(q.limit ?? 30));
    params.set('offset', String(q.offset ?? 0));
    const json = await this.request<{ result?: { total: number; data: Shift[] } }>('GET', `/api/shift?${params.toString()}`);
    return json.result ?? { total: 0, data: [] };
  }

  async openShift(input: { openedCashUsd: number; openedCashKhr: number; exchangeRate: number }): Promise<string> {
    const json = await this.request<{ result?: string }>('POST', '/api/shift/open', input);
    if (!json.result) throw new ApiError('server', undefined, 'No shift id returned');
    return json.result;
  }

  async closeShift(input: { shiftId: string; actualCashUsd: number; actualCashKhr: number }): Promise<void> {
    await this.request('POST', '/api/shift/close', input);
  }

  async paymentMethods(): Promise<PaymentMethod[]> {
    const json = await this.request<{ result?: PaymentMethod[] }>('GET', '/api/payment/method');
    return json.result ?? [];
  }

  /** Pays the order: records the payments, completes it and puts the table in "cleaning". */
  async checkout(orderId: string, input: { slotId: string; payments: CheckoutPayment[] }): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/checkout`, input);
  }

  /** Dishes that must be moved into the POS slot before checkout (kh-pos stock picking list). */
  async stockToTransfer(items: { variantId: string; toFindQty: number }[]): Promise<{ slot?: { posSlot?: boolean } | null }[]> {
    const params = new URLSearchParams({ items: JSON.stringify(items), forReplenishment: '0' });
    const json = await this.request<{ result?: { slot?: { posSlot?: boolean } | null }[] }>('GET', `/api/replenishment/new/stock-picking-list?${params.toString()}`);
    return json.result ?? [];
  }

  /** A finished order with its lines and payments (for the receipt). */
  async orderDetail(orderId: string): Promise<OrderDetailResult> {
    const json = await this.request<{ result?: OrderDetailResult }>('GET', `/api/pos/order/${encodeURIComponent(orderId)}`);
    if (!json.result) throw new ApiError('server', 404, 'Order not found');
    return json.result;
  }

  // ---- table management and transfer ----

  async createTable(input: TableInput): Promise<void> {
    await this.request('POST', '/api/table', input);
  }

  async updateTable(id: string, input: TableInput): Promise<void> {
    await this.request('PUT', '/api/table', { id, ...input });
  }

  async deleteTable(id: string): Promise<void> {
    await this.request('DELETE', '/api/table', { id });
  }

  /** Creates `count` tables named from a prefix, with the same capacity, section and shape. */
  async generateTables(input: { count: number; default: { key: string; capacity: number; section: string; shape: string } }): Promise<void> {
    await this.request('POST', '/api/table/layout', input);
  }

  /** Moves chosen portions of an order to another table (kh-pos merges into its order or opens one). */
  async transferTable(input: TransferBody): Promise<void> {
    await this.request('POST', '/api/transfer-table', input);
  }

  /** Changes the order's type; for a delivery kh-pos also adds the customer's delivery fee to the prices. */
  async setOrderType(orderId: string, input: { customerId: string; code: string; type: 'dine_in' | 'take_away' | 'food_delivery' }): Promise<void> {
    await this.request('PUT', `/api/pos/order/${encodeURIComponent(orderId)}/customer`, input);
  }

  // ---- orders ----

  /** Orders of the branch, newest first, with the filters of the kh-pos order page. */
  async orders(filter: OrderFilter): Promise<{ totalRows: number; orders: OrderRow[] }> {
    const json = await this.request<{ result?: { totalRows: number | { total: number }[]; orders: OrderRow[] } }>('GET', `/api/pos/order?${orderQuery(filter)}`);
    const r = json.result;
    // kh-pos answers the count as a number, or as [{ total }] from the count query
    const raw = r?.totalRows;
    const totalRows = Array.isArray(raw) ? Number(raw[0]?.total ?? 0) : Number(raw ?? 0);
    return { totalRows, orders: r?.orders ?? [] };
  }

  /** Returns portions of finished order lines (refund amount per line, as the web works it out). */
  async createReturns(returns: ReturnInput[]): Promise<string[]> {
    const json = await this.request<{ result?: string[] }>('POST', '/api/pos/return', returns);
    return json.result ?? [];
  }

  /** Counts a receipt print on the order (the web does this before printing). */
  async markPrinted(orderId: string): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/print`, {});
  }

  /** Reopens a paid order as a draft (removes its payments and puts the stock back). */
  async undoOrder(orderId: string): Promise<{ orderId: string; tableNumber: string | null }> {
    const json = await this.request<{ result?: { orderId: string; tableNumber: string | null } }>('PUT', `/api/pos/order/${encodeURIComponent(orderId)}/undo-from-complete-to-draft`, {});
    return json.result ?? { orderId, tableNumber: null };
  }

  /** Deletes an order that hasn't been paid. */
  async deleteOrder(orderId: string): Promise<void> {
    await this.request('DELETE', `/api/pos/order/${encodeURIComponent(orderId)}`);
  }

  /** Prints the line's kitchen ticket again ("Resend to Kitchen" on the web). */
  async resendToKitchen(orderDetailId: string, qty: number): Promise<void> {
    await this.request('POST', '/api/print-queue', { orderDetailId, qty, reprint: true });
  }

  /** Pending portions → cooking. kh-pos queues the kitchen tickets for the printer itself. */
  sendToKitchen(orderId: string, moves: KitchenMove[]): Promise<void> {
    return this.moveStatus(orderId, moves);
  }

  /** Product image URLs may be relative to the kh-pos server. */
  imageUrl(url: string | undefined | null): string | null {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
}
