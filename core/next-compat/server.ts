// @ts-nocheck
/**
 * PHONE VERSION of kh-pos-v2 next-compat/server.ts: the parts of `next/server` the ported route handlers use, without
 * Express or Node streams. A request is built by src/local/server.ts; a response is read back as text.
 */
export class NextURL extends URL {}

export class NextRequest {
  readonly nextUrl: NextURL;
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly routeParams: Record<string, string>;
  readonly ip?: string;
  private readonly bodyText: string | undefined;

  constructor(input: string, init: { method?: string; headers?: Record<string, string>; body?: string; routeParams?: Record<string, string>; ip?: string } = {}) {
    this.url = input;
    this.nextUrl = new NextURL(input);
    this.method = (init.method ?? "GET").toUpperCase();
    this.headers = new Headers(init.headers ?? {});
    this.bodyText = init.body;
    this.routeParams = init.routeParams ?? {};
    this.ip = init.ip ?? "127.0.0.1";
  }

  async text(): Promise<string> {
    return this.bodyText ?? "";
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText ?? "");
  }
  async formData(): Promise<never> {
    throw new Error("File uploads are not available on the phone");
  }

  get cookies() {
    const header = this.headers.get("cookie") ?? "";
    const jar = new Map<string, string>();
    for (const part of header.split(";")) {
      const i = part.indexOf("=");
      if (i > 0) jar.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
    }
    return {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      has: (name: string) => jar.has(name),
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    };
  }
}

type Body = string | Uint8Array | ArrayBuffer | ReadableStream | null | undefined;
type ResponseInitLike = { status?: number; statusText?: string; headers?: Record<string, string> | Headers | [string, string][] };

export class NextResponse<B = unknown> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Body;

  constructor(body?: Body, init: ResponseInitLike = {}) {
    this.body = body ?? null;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers as never);
  }
  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  async text(): Promise<string> {
    const b = this.body;
    if (b === null || b === undefined) return "";
    if (typeof b === "string") return b;
    if (b instanceof Uint8Array || b instanceof ArrayBuffer) return new TextDecoder().decode(b as never);
    // a stream (server-sent progress events): read it all
    const reader = (b as ReadableStream).getReader();
    const dec = new TextDecoder();
    let s = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      s += typeof value === "string" ? value : dec.decode(value, { stream: true });
    }
    return s;
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  static json<J>(body: J, init?: ResponseInitLike): NextResponse<J> {
    const headers = new Headers(init?.headers as never);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse<J>(JSON.stringify(body), { ...init, headers });
  }
  static redirect(url: string | URL, init?: number | ResponseInitLike): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    const headers = new Headers(typeof init === "object" ? (init.headers as never) : undefined);
    headers.set("location", String(url));
    return new NextResponse(null, { status, headers });
  }
  static next(): NextResponse {
    return new NextResponse(null, { status: 200 });
  }
}

export { headers } from "./request-context";
