import type {
  ApiResponse,
  Category,
  CustomerInfo,
  MenuProduct,
  PosInfo,
  Setting,
  Table,
  Warehouse,
} from './types';

export type ApiErrorKind =
  | 'network' // no connection, DNS, timeout
  | 'unauthorized' // token missing, expired, or issued for another table
  | 'forbidden' // not your table / not allowed for diners
  | 'invalid' // 400
  | 'conflict' // 409, e.g. the table already has an open order
  | 'server'; // 5xx or an unexpected answer

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

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'invalid';
  if (status === 409) return 'conflict';
  return 'server';
}

export interface WalkInLoginInput {
  tableId: string;
  deviceId: string;
  lat: number;
  lng: number;
  metaData?: Record<string, unknown>;
}

export interface NewOrderLine {
  /** Order line id, generated on the phone. */
  id: string;
  variantId: string;
  qty: number;
}

export interface MenuQuery {
  warehouse: string;
  search?: string;
  /** Category id, or empty for all. */
  categoryKeys?: string;
  limit: number;
  offset: number;
}

/**
 * kh-pos HTTP client for the dine-in flow. It calls the same endpoints, with the same
 * parameters, as the kh-pos web menu (src/components/gui/product/menu).
 *
 * Prices sent to the server are ignored for customers: the server prices every line from
 * the menu. The client still sends the fields the endpoints require.
 */
export class KhPosApi {
  constructor(
    readonly baseUrl: string,
    private readonly getToken: () => Promise<string | null>,
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    // kh-pos only parses a body when Content-Type is exactly "application/json", and fails
    // on GET requests that declare JSON without a body. So: header only when there is a body.
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

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

    let json: ApiResponse<unknown> & Record<string, unknown>;
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new ApiError(res.ok ? 'server' : kindForStatus(res.status), res.status, 'Unexpected response from server');
    }
    if (!res.ok) {
      throw new ApiError(kindForStatus(res.status), res.status, typeof json.error === 'string' ? json.error : undefined);
    }
    if (json.success === false) {
      throw new ApiError('server', res.status, typeof json.error === 'string' ? json.error : undefined);
    }
    return json as T;
  }

  private async result<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const json = await this.request<ApiResponse<T>>(method, path, body, auth);
    return json.result as T;
  }

  // ---- session ----

  /** Diner login at a table. Only works inside the restaurant's GPS radius. */
  async walkInLogin(input: WalkInLoginInput): Promise<string> {
    const json = await this.request<{ token?: string }>('POST', '/api/auth/customer/walk-in-login', input, false);
    if (!json.token) throw new ApiError('server', undefined, 'No token in login response');
    return json.token;
  }

  /** The diner behind the current token; throws `unauthorized` when the token is no longer valid. */
  async me(): Promise<CustomerInfo> {
    const json = await this.request<{ user?: CustomerInfo; error?: string }>('GET', '/api/auth/customer/walk-in-login');
    if (!json.user) throw new ApiError('unauthorized', 401, json.error);
    return json.user;
  }

  // ---- branch & menu (public) ----

  async warehouse(id: string): Promise<Warehouse | null> {
    const r = await this.result<{ data: Warehouse[] }>('GET', `/api/warehouse?limit=1&offset=0&id=${encodeURIComponent(id)}`, undefined, false);
    return r?.data?.[0] ?? null;
  }

  settings(warehouseId: string): Promise<Setting[]> {
    return this.result('GET', `/api/setting?warehouseId=${encodeURIComponent(warehouseId)}`);
  }

  async categories(warehouseId: string): Promise<Category[]> {
    const r = await this.result<{ data: Category[] }>('GET', `/api/category/menu?warehouse=${encodeURIComponent(warehouseId)}`, undefined, false);
    return r?.data ?? [];
  }

  menu(q: MenuQuery): Promise<MenuProduct[]> {
    const params = new URLSearchParams({
      search: (q.search ?? '').toLowerCase().trim(),
      limit: String(q.limit),
      offset: String(q.offset),
      replenishment: 'false',
      compositeOnly: 'false',
      categoryKeys: q.categoryKeys ?? '',
      warehouse: q.warehouse,
      type: 'pos',
    });
    return this.result('GET', `/api/product-v2/menu?${params.toString()}`, undefined, false);
  }

  posInfo(warehouseId: string): Promise<PosInfo> {
    return this.result('GET', `/api/pos/info?warehouse=${encodeURIComponent(warehouseId)}`);
  }

  // ---- the diner's table ----

  table(tableId: string): Promise<Table> {
    return this.result('GET', `/api/table/${encodeURIComponent(tableId)}`);
  }

  async markTableTaken(tableId: string): Promise<void> {
    await this.request('PUT', `/api/table/${encodeURIComponent(tableId)}`, { status: 'order_taken' });
  }

  /** Opens the table's order with its first lines. Returns the order id. */
  createOrder(input: { warehouseId: string; tableId: string; posInfo: PosInfo; lines: NewOrderLine[] }): Promise<string> {
    return this.result('POST', '/api/pos/order', {
      warehouseId: input.warehouseId,
      slotId: input.posInfo.posSlotId,
      customerId: input.posInfo.posCustomerId,
      invoiceNo: 0, // assigned by the server for customers
      tableNumber: input.tableId,
      items: input.lines.map((l) => ({ id: l.id, variantId: l.variantId, qty: l.qty, price: '0' })),
    });
  }

  async addLine(orderId: string, line: NewOrderLine): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/add-item`, {
      id: line.id,
      variantId: line.variantId,
      qty: line.qty,
      price: '0',
      discountAmount: '0',
    });
  }

  async addModifier(orderId: string, input: { orderDetailId: string; modifierItemId: string; notes?: string }): Promise<void> {
    await this.request('POST', `/api/pos/order/${encodeURIComponent(orderId)}/modifier`, { ...input, price: 0 });
  }

  /** Changes how many portions of a line are still waiting for the kitchen. */
  async setPendingQty(orderId: string, orderDetailId: string, qty: number): Promise<void> {
    await this.request('PUT', `/api/pos/order/${encodeURIComponent(orderId)}/update-item-status`, {
      orderDetailId,
      status: 'pending',
      qty,
    });
  }

  async removeLine(orderId: string, orderDetailId: string): Promise<void> {
    await this.request('DELETE', `/api/pos/order/${encodeURIComponent(orderId)}/remove-item`, { item_id: orderDetailId });
  }
}
