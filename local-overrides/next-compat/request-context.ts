// @ts-nocheck
/**
 * PHONE VERSION of kh-pos-v2 next-compat/request-context.ts. The phone runs one request at a time
 * (src/local/server.ts), so the request being handled is simply the current one.
 */
import type { NextRequest } from "./server";

let current: NextRequest | null = null;
export function setCurrentRequest(req: NextRequest | null) {
  current = req;
}

export async function headers(): Promise<Headers> {
  return current ? current.headers : new Headers();
}
