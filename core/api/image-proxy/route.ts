// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { lookup } from "dns/promises";
import { isIP } from "net";
import { NextRequest, NextResponse } from "../../next-compat/server";

const MAX_BYTES = 10 * 1024 * 1024;

/** Private, loopback, link-local (cloud metadata 169.254.169.254) and other non-public ranges. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateAddress(m[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/**
 * Same-origin proxy for poster/ticket canvas images (CORS). Only public http(s) image URLs: the old version
 * fetched any URL, which let anyone reach internal services / cloud metadata through the server (SSRF).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url parameter", { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return new NextResponse("Invalid url parameter", { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return new NextResponse("Invalid url protocol", { status: 400 });
  }
  try {
    const host = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      return new NextResponse("Forbidden url", { status: 403 });
    }
  } catch {
    return new NextResponse("Failed to fetch image", { status: 502 });
  }

  const response = await fetch(parsedUrl, { redirect: "error", signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!response) return new NextResponse("Failed to fetch image", { status: 502 });
  if (!response.ok) return new NextResponse("Failed to fetch image", { status: response.status });

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return new NextResponse("Not an image", { status: 415 });
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return new NextResponse("Image too large", { status: 413 });

  return new NextResponse(buffer, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
}
