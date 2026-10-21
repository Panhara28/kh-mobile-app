import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { createSecretBox, type KeyStore } from './secret';

const KEY_NAME = 'khpos.outbox.key';

/** The key is kept in the phone's secure storage (Keystore / Keychain), apart from the SQLite file. */
const secureKeys: KeyStore = {
  async get() {
    const hex = await SecureStore.getItemAsync(KEY_NAME).catch(() => null);
    return hex ? hexToBytes(hex) : null;
  },
  async set(key) {
    await SecureStore.setItemAsync(KEY_NAME, bytesToHex(key));
  },
};

/** Seals and opens the secrets of queued changes on this phone. */
export const phoneSecretBox = createSecretBox(secureKeys, (n) => Crypto.getRandomBytesAsync(n));
