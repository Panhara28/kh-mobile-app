import * as SecureStore from 'expo-secure-store';
import { normalizeUsername, toHex, utf8, type CredentialVault, type OfflineCredential } from './offline-login';

/**
 * Offline login records in the phone's secure storage (Android Keystore / iOS Keychain), one per
 * staff member. SecureStore keys may only hold letters, digits and . - _, so the name is hex.
 */
export class SecureStoreVault implements CredentialVault {
  private key(username: string) {
    return `khpos_offline_${toHex(utf8(normalizeUsername(username)))}`;
  }

  async get(username: string): Promise<OfflineCredential | null> {
    const raw = await SecureStore.getItemAsync(this.key(username));
    if (!raw) return null;
    try {
      const c = JSON.parse(raw) as OfflineCredential;
      return c && typeof c.token === 'string' && c.verifier ? c : null;
    } catch {
      return null;
    }
  }

  async put(credential: OfflineCredential): Promise<void> {
    await SecureStore.setItemAsync(this.key(credential.username), JSON.stringify(credential));
  }

  async remove(username: string): Promise<void> {
    await SecureStore.deleteItemAsync(this.key(username));
  }
}
