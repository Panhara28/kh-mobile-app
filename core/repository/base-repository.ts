// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { inList, type Db } from "../db/db";

export type ValueOrKnexRaw<T> = {
  [P in keyof T]: T[P];
};

export default class BaseRepository<T, K = string> {
  protected tableName: string = "";
  protected idColumnName = "id";
  protected tx: Db;
  protected selectColumns: string | string[] = "*";

  constructor(tx: Db) {
    this.tx = tx;
  }

  getTableName() {
    return this.tableName;
  }

  private cols(columns?: string | string[]) {
    const c = columns ?? this.selectColumns;
    return Array.isArray(c) ? c.join(", ") : c;
  }

  async all(): Promise<T[]> {
    return this.tx.query<T>(`SELECT ${this.cols()} FROM "${this.tableName}"`);
  }

  async limitedList(offset: number, limit: number): Promise<T[]> {
    return this.tx.query<T>(`SELECT ${this.cols()} FROM "${this.tableName}" LIMIT ? OFFSET ?`, [limit, offset]);
  }

  async findById(id: K): Promise<T> {
    return (await this.tx.first<T>(`SELECT ${this.cols()} FROM "${this.tableName}" WHERE "${this.idColumnName}" = ? LIMIT 1`, [
      id,
    ])) as T;
  }

  async findByCustomFieldIds(column: string, ids: number[], preserveOrder = false): Promise<T[]> {
    const rows = await this.tx.query<T>(`SELECT ${this.cols()} FROM "${this.tableName}" WHERE "${column}" IN (${inList(ids)})`, ids);
    if (!preserveOrder) return rows;
    return ids.map((id) => {
      const item = rows.find((x: T) => x[column as keyof T] === id);
      if (!item) return null;
      return item;
    }) as T[];
  }

  /** SQLite runs one write transaction at a time, so a plain read inside the transaction is already exclusive. */
  async findByIdForUpdate(id: K): Promise<T> {
    return this.findById(id);
  }

  async findByIds(ids: readonly K[], preserveOrder = false, columns: string | string[] = "*"): Promise<(T | null)[]> {
    if (ids.length === 0) return [];
    const rows = await this.tx.query<T>(
      `SELECT ${this.cols(columns || this.selectColumns)} FROM "${this.tableName}" WHERE "${this.idColumnName}" IN (${inList(ids)})`,
      [...ids],
    );
    if (!preserveOrder) return rows;
    return ids.map((id) => {
      const item = rows.find((x) => x[this.idColumnName as keyof T] === id);
      if (!item) return null;
      return item;
    });
  }

  async insert(value: ValueOrKnexRaw<T>): Promise<number> {
    const result = await this.tx.insert(this.tableName, value as Record<string, unknown>);
    return result[0];
  }

  async insertMerge(value: ValueOrKnexRaw<T>) {
    await this.tx.upsert(this.tableName, value as Record<string, unknown>);
  }

  async insertMany(values: T[]) {
    await this.tx.insert(this.tableName, values as Record<string, unknown>[]);
  }

  async update(id: K, value: ValueOrKnexRaw<T>): Promise<boolean> {
    return (await this.tx.update(this.tableName, { [this.idColumnName]: id }, value as Record<string, unknown>)) as unknown as boolean;
  }

  async updateByCondition(condition: Partial<T>, value: ValueOrKnexRaw<T>): Promise<boolean> {
    return (await this.tx.update(this.tableName, condition as Record<string, unknown>, value as Record<string, unknown>)) as unknown as boolean;
  }
}
