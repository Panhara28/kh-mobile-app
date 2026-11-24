/** The synchronous SQLite connection the phone's kh-pos runs on (expo-sqlite on the phone, node:sqlite in tests). */
export interface SqlDriver {
  all(sql: string, args: unknown[]): Record<string, unknown>[];
  run(sql: string, args: unknown[]): { changes: number; lastInsertRowId: number };
  exec(sql: string): void;
}
