import type { SqlDriver } from './driver';

export interface Migration {
  name: string;
  sql: string;
}

/** Creates / updates the phone database with the kh-pos-v2 schema (the same migrations the server runs). */
export function migrate(db: SqlDriver, migrations: Migration[]): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS "_local_migrations" ("name" TEXT PRIMARY KEY NOT NULL, "applied_at" TEXT NOT NULL)');
  const done = new Set(db.all('SELECT name FROM "_local_migrations"', []).map((r) => String(r.name)));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.run('INSERT INTO "_local_migrations" (name, applied_at) VALUES (?, ?)', [m.name, new Date().toISOString()]);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Database update ${m.name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    applied.push(m.name);
  }
  return applied;
}
