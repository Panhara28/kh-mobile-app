/**
 * kh-pos on this phone: opens the phone's own kh-pos database (the same schema as the kh-pos-v2 server, created on
 * first start) and answers the app's `/api/...` calls with the kh-pos-v2 code in core/. No server is needed.
 */
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import type { SqlDriver } from './driver';
import { migrate } from './migrate';
import { localFetch, setPhoneRoute, type LocalResponse } from './server';
// @ts-ignore generated
import migrations from '../../core/migrations.json';
// @ts-ignore generated
import { setDriver } from '../../core/db/db';

// uuid / nanoid / bcryptjs take their randomness from the Web Crypto API, which Hermes does not have.
const g = globalThis as { crypto?: { getRandomValues?: unknown; randomUUID?: unknown } };
g.crypto ??= {};
g.crypto.getRandomValues ??= Crypto.getRandomValues;
g.crypto.randomUUID ??= Crypto.randomUUID;

export const PHONE_DB_NAME = 'khpos-local.db';
let db: SQLite.SQLiteDatabase | null = null;

function driverOf(d: SQLite.SQLiteDatabase): SqlDriver {
  type Bind = SQLite.SQLiteBindValue[];
  return {
    all: (sql, args) => d.getAllSync<Record<string, unknown>>(sql, args as Bind),
    run: (sql, args) => {
      const r = d.runSync(sql, args as Bind);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    exec: (sql) => d.execSync(sql),
  };
}

/** Opens (and on first start creates) the phone's kh-pos database. Safe to call again. */
export function openPhoneDatabase(): void {
  if (db) return;
  const d = SQLite.openDatabaseSync(PHONE_DB_NAME);
  d.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const driver = driverOf(d);
  migrate(driver, migrations as { name: string; sql: string }[]);
  setDriver(driver);
  db = d;
}

/** Deletes the phone's kh-pos database (every store, user, product and sale on this phone). Opens a blank one. */
export async function erasePhoneDatabase(): Promise<void> {
  setDriver(null);
  db?.closeSync();
  db = null;
  await SQLite.deleteDatabaseAsync(PHONE_DB_NAME).catch(() => undefined);
  await FileSystem.deleteAsync(uploadsDir(), { idempotent: true }).catch(() => undefined);
  openPhoneDatabase();
}

const uploadsDir = () => `${FileSystem.documentDirectory}khpos-uploads/`;

// Pictures (products, categories, logo): kept on the phone; the server put them in cloud storage.
setPhoneRoute('POST', '/api/upload', async (body) => {
  const { fileName, fileContent } = (body ?? {}) as { fileName?: string; fileContent?: string };
  if (!fileName || !fileContent) return { status: 400, json: { error: 'fileName and fileContent are required' } };
  const safe = String(fileName).split(/[\\/]/).pop()!.replace(/[^\w.-]/g, '_');
  await FileSystem.makeDirectoryAsync(uploadsDir(), { intermediates: true }).catch(() => undefined);
  const uri = `${uploadsDir()}${safe}`;
  await FileSystem.writeAsStringAsync(uri, fileContent, { encoding: FileSystem.EncodingType.Base64 });
  return { status: 200, json: { url: uri } };
});

/** `fetch` for the API client: the phone's own kh-pos. */
export function phoneFetch(input: string, init?: { method?: string; headers?: Record<string, string>; body?: string | null }): Promise<LocalResponse> {
  openPhoneDatabase();
  return localFetch(input, init);
}
