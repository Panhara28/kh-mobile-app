import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

/**
 * Logging in without the server (see docs/DECISIONS.md, "Offline login").
 *
 * kh-pos checks passwords itself (bcrypt) and no API exposes them, so the phone can't check a
 * password the server has never shown it. What it can do: after a staff member logs in with a
 * connection, remember a salted, slow hash of that password on this phone (in secure storage,
 * Android Keystore / iOS Keychain), together with the kh-pos token the login returned. Later,
 * with no connection, a password typed on this phone is checked against that hash. Only people
 * who logged in on this phone before can do it, and nobody else's credentials are ever copied.
 */

export interface Verifier {
  v: 1;
  /** hex */
  salt: string;
  iterations: number;
  /** hex */
  hash: string;
}

/** What is kept for a staff member who logged in on this phone. */
export interface OfflineCredential {
  /** Lower-case login name. */
  username: string;
  verifier: Verifier;
  /** The kh-pos token the online login returned. */
  token: string;
  savedAt: number;
}

export interface CredentialVault {
  get(username: string): Promise<OfflineCredential | null>;
  put(credential: OfflineCredential): Promise<void>;
  remove(username: string): Promise<void>;
}

/**
 * PBKDF2-HMAC-SHA256 rounds. Chosen so that checking a password takes a few seconds in the app's
 * JavaScript engine (no native crypto in Expo Go) while the hash sits in hardware-backed secure
 * storage. Stored with each hash, so it can be raised later without breaking older ones.
 */
export const DEFAULT_ITERATIONS = 20_000;

export const normalizeUsername = (username: string) => username.trim().toLowerCase();

const HEX = '0123456789abcdef';
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** UTF-8 bytes of a string (Khmer passwords included), without relying on TextEncoder. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  // The async version gives the app a chance to draw between batches of rounds.
  return pbkdf2Async(sha256, utf8(password), salt, { c: iterations, dkLen: 32 });
}

export async function makeVerifier(password: string, salt: Uint8Array, iterations = DEFAULT_ITERATIONS): Promise<Verifier> {
  return { v: 1, salt: toHex(salt), iterations, hash: toHex(await derive(password, salt, iterations)) };
}

/** Compares without stopping at the first difference. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function checkPassword(password: string, verifier: Verifier): Promise<boolean> {
  if (verifier.v !== 1 || !verifier.hash || !verifier.salt || !(verifier.iterations > 0)) return false;
  return sameBytes(await derive(password, fromHex(verifier.salt), verifier.iterations), fromHex(verifier.hash));
}

/** Remembers a successful online login for later offline use (replaces an older one for the same name). */
export async function rememberLogin(
  vault: CredentialVault,
  input: { username: string; password: string; token: string },
  randomBytes: (n: number) => Uint8Array,
  now: () => number = Date.now,
  iterations = DEFAULT_ITERATIONS,
): Promise<void> {
  const username = normalizeUsername(input.username);
  await vault.put({ username, verifier: await makeVerifier(input.password, randomBytes(16), iterations), token: input.token, savedAt: now() });
}

export type OfflineLoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'noAccount' | 'wrongPassword' | 'locked'; retryInMs?: number };

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

/** Checks a typed password against what this phone remembered, with a pause after repeated mistakes. */
export class OfflineLogin {
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly vault: CredentialVault,
    private readonly now: () => number = Date.now,
  ) {}

  async verify(username: string, password: string): Promise<OfflineLoginResult> {
    const name = normalizeUsername(username);
    const state = this.failures.get(name);
    if (state && state.lockedUntil > this.now()) return { ok: false, reason: 'locked', retryInMs: state.lockedUntil - this.now() };

    const saved = await this.vault.get(name);
    if (!saved) return { ok: false, reason: 'noAccount' };

    if (await checkPassword(password, saved.verifier)) {
      this.failures.delete(name);
      return { ok: true, token: saved.token };
    }
    const count = (state?.count ?? 0) + 1; // a lock resets the count, so a new round starts after it
    const locked = count >= MAX_FAILURES;
    this.failures.set(name, { count: locked ? 0 : count, lockedUntil: locked ? this.now() + LOCK_MS : 0 });
    return locked ? { ok: false, reason: 'locked', retryInMs: LOCK_MS } : { ok: false, reason: 'wrongPassword' };
  }
}

/** In-memory vault for tests. */
export class MemoryVault implements CredentialVault {
  private map = new Map<string, OfflineCredential>();
  async get(username: string) {
    const c = this.map.get(normalizeUsername(username));
    return c ? (JSON.parse(JSON.stringify(c)) as OfflineCredential) : null;
  }
  async put(credential: OfflineCredential) {
    this.map.set(normalizeUsername(credential.username), JSON.parse(JSON.stringify(credential)));
  }
  async remove(username: string) {
    this.map.delete(normalizeUsername(username));
  }
}
