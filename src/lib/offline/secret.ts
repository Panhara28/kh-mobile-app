import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Encryption at rest for the few queued changes that carry a secret (a password, a file): the text is sealed with
 * XChaCha20-Poly1305 and a random key that lives only in the phone's secure storage (Android Keystore / iOS Keychain),
 * never in the SQLite file. Anyone who copies the database (a backup, a rooted phone) gets only `enc1:...`.
 */

export interface KeyStore {
  get(): Promise<Uint8Array | null>;
  set(key: Uint8Array): Promise<void>;
}

export interface SecretBox {
  seal(plain: string): Promise<string>;
  open(sealed: string): Promise<string>;
}

const PREFIX = 'enc1:';
const NONCE_BYTES = 24;
const KEY_BYTES = 32;

/** `random(n)` must give n cryptographically random bytes. */
export function createSecretBox(keys: KeyStore, random: (n: number) => Promise<Uint8Array> | Uint8Array): SecretBox {
  let cached: Uint8Array | null = null;

  async function key(): Promise<Uint8Array> {
    if (cached) return cached;
    let k = await keys.get();
    if (!k || k.length !== KEY_BYTES) {
      k = await random(KEY_BYTES);
      await keys.set(k);
    }
    cached = k;
    return k;
  }

  return {
    async seal(plain) {
      const nonce = await random(NONCE_BYTES);
      const sealed = xchacha20poly1305(await key(), nonce).encrypt(utf8ToBytes(plain));
      return `${PREFIX}${bytesToHex(nonce)}${bytesToHex(sealed)}`;
    },
    async open(sealed) {
      if (!sealed.startsWith(PREFIX)) throw new Error('Not a sealed value');
      const raw = hexToBytes(sealed.slice(PREFIX.length));
      const nonce = raw.slice(0, NONCE_BYTES);
      const data = raw.slice(NONCE_BYTES);
      try {
        return new TextDecoder().decode(xchacha20poly1305(await key(), nonce).decrypt(data));
      } catch {
        // wrong key (the phone's secure storage was reset) or the value was changed
        throw new Error('This saved change can no longer be read on this phone. Discard it and do it again.');
      }
    },
  };
}
