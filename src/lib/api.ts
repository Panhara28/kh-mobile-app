/**
 * kh-pos API client for staff, using the same endpoints as the kh-pos web app.
 * Response shapes are copied from the kh-pos sources; only the fields the app uses are typed.
 */

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
  warehouse: { id: string; name: string } | null;
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
  /** App only: the order was started offline and has no kh-pos order or invoice number yet. */
  localOnly?: boolean;
}

export interface RestaurantTable {
  id: string;
  table_name: string;
  setting_capacity: number | null;
  section: string | null;
  status: TableStatus;
  order: TableOrder | null;
  /** App only: changes made on this phone that kh-pos hasn't received yet. */
  pendingSync?: number;
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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) throw new ApiError('notConfigured', undefined, 'No server address (EXPO_PUBLIC_KHPOS_URL)');
    const headers: Record<string, string> = {};
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
    return json as T;
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
