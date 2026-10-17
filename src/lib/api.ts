/**
 * kh-pos API client for staff, using the same endpoints as the kh-pos web app.
 * Response shapes are copied from the kh-pos sources; only the fields the app uses are typed.
 */

export type ApiErrorKind =
  | 'network' // no connection, wrong server address, timeout
  | 'invalidCredentials' // wrong username or password
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
  role: { role: string } | null;
}

export interface Setting {
  option: string;
  value: string | null;
}

export interface Category {
  id: string;
  title: string;
  forSaleCount?: number;
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
    if (!this.baseUrl) throw new ApiError('network', undefined, 'No server address (EXPO_PUBLIC_KHPOS_URL)');
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

  /** Product image URLs may be relative to the kh-pos server. */
  imageUrl(url: string | undefined | null): string | null {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
}
