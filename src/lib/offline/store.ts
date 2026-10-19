import { MemoryStore } from './memory-store';
import { SqliteStore } from './sqlite-store';
import type { LocalStore } from './types';

/** Where the phone's data is kept: 'sqlite' normally; 'memory' only if SQLite couldn't be opened. */
export const storeInfo: { kind: 'sqlite' | 'memory'; error: string | null } = { kind: 'sqlite', error: null };

let opened: Promise<LocalStore> | null = null;

/**
 * The phone's local store, opened once. If SQLite can't be opened (it should always work) the app
 * falls back to a store in memory: everything still works online, only nothing survives a
 * restart. `storeInfo` says which one is in use (shown in the sync sheet).
 */
export function getStore(): Promise<LocalStore> {
  opened ??= SqliteStore.open().catch((e: unknown) => {
    storeInfo.kind = 'memory';
    storeInfo.error = e instanceof Error ? e.message : String(e);
    console.warn('KH POS: could not open the phone database, keeping data in memory only:', storeInfo.error);
    return new MemoryStore();
  });
  return opened;
}
