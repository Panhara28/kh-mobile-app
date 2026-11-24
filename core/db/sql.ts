// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * Composes the WHERE clause of a raw SQL query whose filters are optional (lists, reports): the Prisma way of
 * building dynamic queries (fragments + parameters), run through Db.query / Prisma $queryRawUnsafe.
 *
 *   const w = new Where().eq("o.warehouse_id", id);
 *   if (filter.status) w.eq("o.order_status", filter.status);
 *   if (filter.from) w.raw("COALESCE(o.paid_at, o.created_at) >= ?", filter.from);
 *   await db.query(`SELECT o.* FROM customer_order o ${w}`, w.args);
 */
import { inList } from "./db";

export class Where {
  private parts: string[] = [];
  readonly args: unknown[] = [];

  /** col = value (null -> IS NULL, like knex). */
  eq(col: string, value: unknown) {
    if (value === undefined) throw new Error(`Undefined binding(s) detected when compiling WHERE. Undefined column(s): [${col}]`);
    if (value === null) this.parts.push(`${col} IS NULL`);
    else {
      this.parts.push(`${col} = ?`);
      this.args.push(value);
    }
    return this;
  }

  /** col <op> value */
  op(col: string, op: "<" | "<=" | ">" | ">=" | "<>" | "!=" | "LIKE", value: unknown) {
    this.parts.push(`${col} ${op} ?`);
    this.args.push(value);
    return this;
  }

  in(col: string, values: readonly unknown[]) {
    this.parts.push(`${col} IN (${inList(values)})`);
    this.args.push(...values);
    return this;
  }

  notIn(col: string, values: readonly unknown[]) {
    if (values.length) {
      this.parts.push(`${col} NOT IN (${inList(values)})`);
      this.args.push(...values);
    }
    return this;
  }

  isNull(col: string) {
    this.parts.push(`${col} IS NULL`);
    return this;
  }

  notNull(col: string) {
    this.parts.push(`${col} IS NOT NULL`);
    return this;
  }

  /** Any SQL condition with `?` placeholders; wrapped in parentheses. */
  raw(sql: string, ...args: unknown[]) {
    this.parts.push(`(${sql})`);
    this.args.push(...args.flat());
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  /** "WHERE a AND b" (or "" when there is no condition). */
  toString() {
    return this.parts.length ? `WHERE ${this.parts.join(" AND ")}` : "";
  }

  /** "AND a AND b" to append to an existing WHERE. */
  get and() {
    return this.parts.length ? `AND ${this.parts.join(" AND ")}` : "";
  }
}

/**
 * MySQL `MATCH(col) AGAINST (? IN NATURAL LANGUAGE MODE)` matched rows containing ANY of the words. Builds the
 * equivalent FTS5 query (each word quoted, OR-ed) so user input can never be parsed as FTS syntax.
 * Returns null when there is no searchable word.
 */
export function ftsAnyWord(text: string): string | null {
  const words = text
    .split(/[\s\p{P}]+/u)
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return null;
  return words.map((w) => `"${w.replace(/"/g, '""')}"`).join(" OR ");
}
