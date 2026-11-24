// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";
import { HttpError } from "./server-functions/customer-scope";

/**
 * Verifies a Google Sign-In ID token (RS256 JWT) with Google's public keys, using only
 * node:crypto. The app sends the ID token it got from Google; the server never trusts an
 * email or Google user id sent by the app itself.
 */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const CLOCK_SKEW_SECONDS = 60;

export interface GoogleIdentity {
  /** Stable Google account id. */
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

let keyCache: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

async function googleKey(kid: string): Promise<KeyObject> {
  if (!keyCache || Date.now() > keyCache.expiresAt || !keyCache.keys.has(kid)) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new HttpError(503, "Could not reach Google to verify sign-in");
    const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    keyCache = {
      keys: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: "jwk" })])),
      expiresAt: Date.now() + maxAge * 1000,
    };
  }
  const key = keyCache.keys.get(kid);
  if (!key) throw new HttpError(401, "Invalid Google sign-in");
  return key;
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

/** Allowed OAuth client ids (iOS, Android, web), from GOOGLE_CLIENT_IDS. Empty = disabled. */
export function googleClientIds(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audiences = googleClientIds();
  if (audiences.length === 0) {
    throw new HttpError(503, "Google sign-in is not configured on this server");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Invalid Google sign-in");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
  };
  try {
    header = decodePart(headerPart);
    payload = decodePart(payloadPart);
  } catch {
    throw new HttpError(401, "Invalid Google sign-in");
  }
  if (header.alg !== "RS256" || !header.kid) throw new HttpError(401, "Invalid Google sign-in");

  const key = await googleKey(header.kid);
  const signatureOk = verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signatureOk) throw new HttpError(401, "Invalid Google sign-in");

  const now = Math.floor(Date.now() / 1000);
  if (!payload.iss || !ISSUERS.includes(payload.iss)) throw new HttpError(401, "Invalid Google sign-in");
  if (!payload.aud || !audiences.includes(payload.aud)) throw new HttpError(401, "Invalid Google sign-in");
  if (!payload.exp || payload.exp + CLOCK_SKEW_SECONDS < now) throw new HttpError(401, "Google sign-in expired");
  if (!payload.sub || !payload.email) throw new HttpError(401, "Invalid Google sign-in");
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new HttpError(401, "Google email is not verified");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture,
  };
}
