/**
 * kh-pos on the phone: the kh-pos-v2 API route handlers (core/, copied by scripts/sync-core.mjs) answering the app's
 * `/api/...` calls from the phone's own database, with no server. `localFetch` has the shape of `fetch`, so the API
 * client (lib/api.ts) works unchanged.
 *
 * Requests run one at a time: the database has one connection, and a transaction must not see another request's
 * writes half-done. A phone serves one person, so this costs nothing noticeable.
 */
// @ts-ignore generated, not type-checked
import { ROUTES, loadRoute } from '../../core/routes';
// @ts-ignore generated, not type-checked
import { NextRequest } from '../../core/next-compat/server';
// @ts-ignore generated, not type-checked
import { setCurrentRequest } from '../../core/next-compat/request-context';

import { PHONE_ORIGIN } from '../lib/config';

export const LOCAL_ORIGIN = PHONE_ORIGIN;

interface Compiled {
  method: string;
  re: RegExp;
  keys: string[];
  file: string;
  exp: string;
}

let compiled: Compiled[] | null = null;
function routes(): Compiled[] {
  if (compiled) return compiled;
  compiled = (ROUTES as { method: string; path: string; file: string; exp: string }[]).map((r) => {
    const keys: string[] = [];
    const pattern = r.path
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    return { method: r.method, re: new RegExp(`^${pattern}/?$`), keys, file: r.file, exp: r.exp };
  });
  return compiled;
}

/** The route for a method and path (first match wins, as on the server), with its `:params`. */
export function matchRoute(method: string, pathname: string): { route: Compiled; params: Record<string, string> } | null {
  for (const route of routes()) {
    if (route.method !== method) continue;
    const m = route.re.exec(pathname);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? '')));
    return { route, params };
  }
  return null;
}

export interface LocalResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function answer(status: number, text: string, headers?: Headers): LocalResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers ?? new Headers({ 'content-type': 'application/json' }),
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

type PhoneRoute = (body: unknown) => Promise<{ status: number; json: unknown }>;
const phoneRoutes = new Map<string, PhoneRoute>();
/** A route the phone answers itself instead of the kh-pos-v2 code (e.g. picture uploads go to the phone's storage). */
export function setPhoneRoute(method: string, path: string, fn: PhoneRoute) {
  phoneRoutes.set(`${method.toUpperCase()} ${path}`, fn);
}

let queue: Promise<unknown> = Promise.resolve();

/** `fetch` for kh-pos on the phone. Only `/api/...` paths exist; the origin is ignored. */
export function localFetch(input: string, init: { method?: string; headers?: Record<string, string>; body?: string | null } = {}): Promise<LocalResponse> {
  const run = queue.then(() => handle(input, init));
  queue = run.catch(() => undefined);
  return run;
}

async function handle(input: string, init: { method?: string; headers?: Record<string, string>; body?: string | null }): Promise<LocalResponse> {
  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(input, LOCAL_ORIGIN);
  const own = phoneRoutes.get(`${method} ${url.pathname}`);
  if (own) {
    try {
      const r = await own(init.body ? JSON.parse(init.body) : undefined);
      return answer(r.status, JSON.stringify(r.json));
    } catch (e) {
      return answer(500, JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  const hit = matchRoute(method, url.pathname);
  if (!hit) return answer(404, JSON.stringify({ success: false, error: `Not found: ${method} ${url.pathname}` }));

  const mod = loadRoute(hit.route.file);
  const handler = mod?.[hit.route.exp];
  if (typeof handler !== 'function') return answer(405, JSON.stringify({ success: false, error: 'Method not allowed' }));

  const req = new NextRequest(`${LOCAL_ORIGIN}${url.pathname}${url.search}`, {
    method,
    headers: init.headers ?? {},
    body: init.body ?? undefined,
    routeParams: hit.params,
  });
  setCurrentRequest(req);
  try {
    const res = await handler(req, { params: Promise.resolve(hit.params) });
    return answer(res.status, await res.text(), res.headers);
  } catch (e) {
    return answer(500, JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
  } finally {
    setCurrentRequest(null);
  }
}
