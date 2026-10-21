import * as SQLite from 'expo-sqlite';
import type { CachedValue, LocalStore, NewCommand, OutboxCommand } from './types';

const DB_NAME = 'khpos-offline.db';

/**
 * The phone's local database. Each entry is one schema version, applied in order and recorded in
 * PRAGMA user_version, so a later app version can add tables or columns without losing data.
 * Never edit an entry that has shipped: add a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE cache (
    key      TEXT PRIMARY KEY NOT NULL,
    json     TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );
  CREATE TABLE outbox (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    table_id   TEXT NOT NULL,
    payload    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    error      TEXT,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX outbox_table_idx ON outbox (table_id);
  `,
];

interface OutboxRow {
  seq: number;
  id: string;
  user_id: string;
  kind: OutboxCommand['kind'];
  table_id: string;
  payload: string;
  status: OutboxCommand['status'];
  error: string | null;
  attempts: number;
  created_at: number;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[v]!);
      await txn.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export class SqliteStore implements LocalStore {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(): Promise<SqliteStore> {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await migrate(db);
    return new SqliteStore(db);
  }

  async getCache<T>(key: string): Promise<CachedValue<T> | null> {
    const row = await this.db.getFirstAsync<{ json: string; saved_at: number }>('SELECT json, saved_at FROM cache WHERE key = ?', key);
    if (!row) return null;
    try {
      return { value: JSON.parse(row.json) as T, savedAt: row.saved_at };
    } catch {
      return null; // unreadable entry: behave as if it was never saved
    }
  }

  async setCache(key: string, value: unknown): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO cache (key, json, saved_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, saved_at = excluded.saved_at',
      key,
      JSON.stringify(value),
      Date.now(),
    );
  }

  async deleteCache(key: string): Promise<void> {
    await this.db.runAsync('DELETE FROM cache WHERE key = ?', key);
  }

  async outboxAdd(cmd: NewCommand): Promise<void> {
    await this.db.runAsync(
      "INSERT OR IGNORE INTO outbox (id, user_id, kind, table_id, payload, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)",
      cmd.id,
      cmd.userId,
      cmd.kind,
      cmd.tableId,
      JSON.stringify(cmd.payload),
      cmd.createdAt,
    );
  }

  async outboxList(): Promise<OutboxCommand[]> {
    const rows = await this.db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY seq');
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      tableId: r.table_id,
      payload: JSON.parse(r.payload) as OutboxCommand['payload'],
      status: r.status,
      error: r.error,
      attempts: r.attempts,
      createdAt: r.created_at,
      seq: r.seq,
    })) as OutboxCommand[];
  }

  async outboxUpdate(id: string, patch: Partial<Pick<OutboxCommand, 'status' | 'error' | 'attempts' | 'payload'>>): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.error !== undefined) {
      sets.push('error = ?');
      params.push(patch.error);
    }
    if (patch.attempts !== undefined) {
      sets.push('attempts = ?');
      params.push(patch.attempts);
    }
    if (patch.payload !== undefined) {
      sets.push('payload = ?');
      params.push(JSON.stringify(patch.payload));
    }
    if (sets.length === 0) return;
    await this.db.runAsync(`UPDATE outbox SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }

  async outboxRemove(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM outbox WHERE id = ?', id);
  }
}
