// @ts-nocheck
/**
 * PHONE VERSION of kh-pos-v2 apps/api/src/db/db.ts (copied over it by scripts/sync-core.mjs).
 *
 * Same `Db` surface the ported business code uses (query/first/exec/tx/batch, the knex-style single-table helpers,
 * the knex builder, and `db.p.<table>.findMany/...` for the few Prisma calls), running on the phone's own SQLite
 * file through a synchronous driver (expo-sqlite on the phone, node:sqlite in tests) instead of Prisma + libSQL.
 * Values keep the mysql2 shapes through coerce.ts, exactly as on the server.
 *
 * Requests are run one at a time (src/local/server.ts), so a transaction never interleaves with another request.
 */
import { fn as kfn, knexSurface, ref as kref, type Knex } from "./knex-compat";
import { readRawRows, readValue, TABLES, writeArg, writeData, writeValue, type ColumnKind } from "./coerce";

/** The SQLite connection the phone opens (src/local/database.ts). */
export interface SqlDriver {
  all(sql: string, args: unknown[]): Record<string, unknown>[];
  run(sql: string, args: unknown[]): { changes: number; lastInsertRowId: number };
  exec(sql: string): void;
}

let driver: SqlDriver | null = null;
/** Points every Db at this connection (once, when the phone database is opened). */
export function setDriver(d: SqlDriver | null) {
  driver = d;
}
function sql(): SqlDriver {
  if (!driver) throw new Error("The phone database is not open");
  return driver;
}

let txDepth = 0;

export type RawSpec = Record<string, ColumnKind | { kind: ColumnKind; scale?: number } | null>;
type Row = Record<string, unknown>;

export class Db {
  /** Prisma-like model delegates, e.g. `db.p.product.findMany({ where: { id: { in: ids } } })` */
  readonly p: Record<string, ModelDelegate>;

  constructor(readonly inTransaction = false) {
    const self = this;
    this.p = new Proxy({} as Record<string, ModelDelegate>, {
      get(cache, table: string) {
        if (typeof table !== "string") return undefined;
        return (cache[table] ??= delegate(self, table));
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<T = any>(text: string, args: unknown[] = [], spec?: RawSpec): Promise<T[]> {
    const rows = sql().all(text, args.map(writeArg));
    return readRawRows<T>(rows, aggregateSpec(text, spec) as never);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async first<T = any>(text: string, args: unknown[] = [], spec?: RawSpec): Promise<T> {
    const rows = await this.query<T>(text, args, spec);
    return rows[0] as T;
  }

  private kxs?: ReturnType<typeof knexSurface>;
  private get kx() {
    return (this.kxs ??= knexSurface(this));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table<TRecord extends {} = any, TResult = any[]>(name: string | Knex.Raw | Knex.AliasDict): Knex.QueryBuilder<TRecord, TResult> {
    return this.kx.table<TRecord, TResult>(name);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw<TResult = any>(text: string, bindings?: Knex.RawBinding | Knex.RawBinding[] | Knex.ValueDict): Knex.Raw<TResult> {
    return this.kx.raw<TResult>(text, bindings);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryBuilder<TRecord extends {} = any, TResult = any[]>(): Knex.QueryBuilder<TRecord, TResult> {
    return this.kx.queryBuilder<TRecord, TResult>();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select(...args: any[]): Knex.QueryBuilder {
    return this.kx.select(...args);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  with(alias: string, q: any): Knex.QueryBuilder {
    return this.kx.with(alias, q);
  }
  get fn() {
    return kfn;
  }
  ref(name: string) {
    return kref(name);
  }

  async exec(text: string, args: unknown[] = []): Promise<number> {
    return sql().run(text, args.map(writeArg)).changes;
  }

  /** All or nothing. Nested (or overlapping) calls join the open transaction, like on the server. */
  async tx<T>(fn: (trx: Db) => Promise<T>, _opts?: { timeout?: number; maxWait?: number }): Promise<T> {
    if (this.inTransaction || txDepth > 0) return fn(this.inTransaction ? this : new Db(true));
    sql().exec("BEGIN IMMEDIATE");
    txDepth++;
    try {
      const out = await fn(new Db(true));
      txDepth--;
      sql().exec("COMMIT");
      return out;
    } catch (e) {
      txDepth--;
      try {
        sql().exec("ROLLBACK");
      } catch {
        // already rolled back
      }
      throw e;
    }
  }

  async batch(statements: { sql: string; args?: unknown[] }[]): Promise<void> {
    if (!statements.length) return;
    await this.tx(async (trx) => {
      for (const s of statements) await trx.exec(s.sql, s.args);
    });
  }

  /** `knex(table).insert(rows)`: [first new id] for integer-id tables, else [0] (like mysql2). */
  async insert(table: string, data: object | object[]): Promise<number[]> {
    const rows = ((Array.isArray(data) ? data : [data]) as Row[]).map(stripUndefined);
    if (!rows.length) return [];
    let first = 0;
    const write = async (trx: Db) => {
      for (let i = 0; i < rows.length; i++) {
        const id = insertRow(table, rows[i]);
        if (i === 0) first = id;
      }
    };
    if (rows.length > 1) await this.tx(write);
    else await write(this);
    return [hasIntId(table) ? first : 0];
  }

  async update(table: string, where: object, data: object): Promise<number> {
    const d = stripUndefined(data as Row);
    if (!Object.keys(d).length) return 0;
    return updateRows(table, assertWhere(where as Row), d);
  }

  async del(table: string, where: object): Promise<number> {
    const args: unknown[] = [];
    const w = whereSql(table, writeData(table, assertWhere(where as Row), true) as Row, args);
    return sql().run(`DELETE FROM "${table}"${w ? ` WHERE ${w}` : ""}`, args).changes;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rows<T = any>(table: string, where: object = {}, opts?: FindOpts | Record<string, "asc" | "desc">): Promise<T[]> {
    return findRows(table, findArgs(where as Row, opts)) as T[];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async row<T = any>(table: string, where: object = {}, opts?: FindOpts | Record<string, "asc" | "desc">): Promise<T | any> {
    return findRows(table, { ...findArgs(where as Row, opts), take: 1 })[0] as T;
  }

  async count(table: string, where: object = {}): Promise<number> {
    const args: unknown[] = [];
    const w = whereSql(table, writeData(table, assertWhere(where as Row), true) as Row, args);
    const r = sql().all(`SELECT COUNT(*) AS n FROM "${table}"${w ? ` WHERE ${w}` : ""}`, args)[0];
    return Number(r?.n ?? 0);
  }

  async upsert(table: string, data: object | object[], mergeColumns?: string[], conflictColumns?: string[]): Promise<void> {
    const rows = ((Array.isArray(data) ? data : [data]) as Row[]).map(stripUndefined);
    if (!rows.length) return;
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const merge = mergeColumns ?? cols;
    const spec = TABLES[table] ?? {};
    const values = rows.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
    const args = rows.flatMap((r) => cols.map((c) => writeValue(spec[c], r[c] === undefined ? null : r[c])));
    const target = conflictColumns?.length ? `(${conflictColumns.map((c) => `"${c}"`).join(", ")})` : "";
    const action = merge.length ? `DO UPDATE SET ${merge.map((c) => `"${c}" = excluded."${c}"`).join(", ")}` : "DO NOTHING";
    await this.exec(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${values} ON CONFLICT ${target} ${action}`, args);
  }

  async insertIgnore(table: string, data: object | object[]): Promise<void> {
    return this.upsert(table, data, []);
  }
}

// ---- Prisma model operations, in SQL ---------------------------------------------------------------------------

interface ModelDelegate {
  create(args: { data: Row; select?: Record<string, boolean> }): Promise<Row>;
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
  createManyAndReturn(args: { data: Row[]; select?: Record<string, boolean> }): Promise<Row[]>;
  updateMany(args: { where?: Row; data: Row }): Promise<{ count: number }>;
  deleteMany(args?: { where?: Row }): Promise<{ count: number }>;
  findMany(args?: FindArgs): Promise<Row[]>;
  findFirst(args?: FindArgs): Promise<Row | null>;
  count(args?: { where?: Row }): Promise<number>;
}

interface FindArgs {
  where?: Row;
  orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
  take?: number;
  skip?: number;
  select?: Record<string, boolean>;
}

function delegate(db: Db, table: string): ModelDelegate {
  if (!TABLES[table]) throw new Error(`Unknown table "${table}"`);
  const byRowid = (rowid: number, select?: Record<string, boolean>) =>
    findRows(table, { where: {}, select, rowid })[0] ?? null;
  return {
    async create({ data, select }) {
      const rowid = insertRow(table, stripUndefined(data), true);
      return byRowid(rowid, select);
    },
    async createMany({ data }) {
      const rows = (Array.isArray(data) ? data : [data]).map(stripUndefined);
      await db.tx(async () => rows.forEach((r) => insertRow(table, r)));
      return { count: rows.length };
    },
    async createManyAndReturn({ data, select }) {
      const rows = (Array.isArray(data) ? data : [data]).map(stripUndefined);
      const out: Row[] = [];
      await db.tx(async () => {
        for (const r of rows) out.push(byRowid(insertRow(table, r, true), select));
      });
      return out;
    },
    async updateMany({ where = {}, data }) {
      return { count: updateRows(table, assertWhere(where), stripUndefined(data)) };
    },
    async deleteMany(args) {
      return { count: await db.del(table, args?.where ?? {}) };
    },
    async findMany(args = {}) {
      return findRows(table, { ...args, where: assertWhere(args.where ?? {}) });
    },
    async findFirst(args = {}) {
      return findRows(table, { ...args, where: assertWhere(args.where ?? {}), take: 1 })[0] ?? null;
    },
    async count(args = {}) {
      return db.count(table, args.where ?? {});
    },
  };
}

/** Inserts one row; returns the new id for integer-id tables (or the rowid when asked). */
function insertRow(table: string, row: Row, wantRowid = false): number {
  const data = writeData(table, row) as Row;
  const cols = Object.keys(data);
  const text = cols.length
    ? `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
    : `INSERT INTO "${table}" DEFAULT VALUES`;
  const r = sql().run(text, cols.map((c) => writeArg(data[c])));
  if (wantRowid) return r.lastInsertRowId;
  return hasIntId(table) ? r.lastInsertRowId : 0;
}

function updateRows(table: string, where: Row, data: Row): number {
  const spec = TABLES[table] ?? {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && ("increment" in v || "decrement" in v)) {
      const n = (v as Row).increment ?? -Number((v as Row).decrement);
      sets.push(`"${k}" = COALESCE("${k}", 0) + ?`);
      args.push(Number(n));
      continue;
    }
    const w = (writeData(table, { [k]: v }) as Row)[k];
    sets.push(`"${k}" = ?`);
    args.push(writeArg(w));
  }
  if (!sets.length) return 0;
  const w = whereSql(table, writeData(table, where, true) as Row, args);
  return sql().run(`UPDATE "${table}" SET ${sets.join(", ")}${w ? ` WHERE ${w}` : ""}`, args).changes;
}

function findRows(table: string, a: FindArgs & { rowid?: number }): Row[] {
  const args: unknown[] = [];
  let w = whereSql(table, writeData(table, a.where ?? {}, true) as Row, args);
  if (a.rowid !== undefined) {
    w = w ? `(${w}) AND rowid = ?` : "rowid = ?";
    args.push(a.rowid);
  }
  const cols = a.select && Object.keys(a.select).some((k) => a.select![k]) ? Object.keys(a.select).filter((k) => a.select![k]).map((c) => `"${c}"`).join(", ") : "*";
  const order = (Array.isArray(a.orderBy) ? a.orderBy : a.orderBy ? [a.orderBy] : [])
    .flatMap((o) => Object.entries(o))
    .map(([c, d]) => `"${c}" ${String(d).toLowerCase() === "desc" ? "DESC" : "ASC"}`);
  let text = `SELECT ${cols} FROM "${table}"${w ? ` WHERE ${w}` : ""}${order.length ? ` ORDER BY ${order.join(", ")}` : ""}`;
  if (a.take !== undefined || a.skip !== undefined) text += ` LIMIT ${a.take ?? -1} OFFSET ${a.skip ?? 0}`;
  return sql().all(text, args).map((r) => readTableRow(table, r));
}

/** A row of a known table, read the way Prisma + coerce.ts read it (JSON parsed, dates, decimals, 0/1). */
function readTableRow(table: string, row: Row): Row {
  const spec = TABLES[table];
  if (!spec) return row;
  for (const k in row) {
    const s = spec[k];
    if (s) row[k] = readValue(s, row[k]);
  }
  return row;
}

const isOps = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const like = (s: unknown) => String(s).replace(/[\\%_]/g, (c) => "\\" + c);

/** A Prisma `where` as SQL (values already converted by writeData). */
function whereSql(table: string, where: Row, args: unknown[]): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (k === "AND" || k === "OR" || k === "NOT") {
      const list = (Array.isArray(v) ? v : [v]).map((x) => whereSql(table, x as Row, args)).filter(Boolean);
      if (k === "AND") {
        if (list.length) parts.push(list.map((s) => `(${s})`).join(" AND "));
      } else if (k === "OR") parts.push(list.length ? `(${list.map((s) => `(${s})`).join(" OR ")})` : "0");
      else if (list.length) parts.push(`NOT (${list.map((s) => `(${s})`).join(" AND ")})`);
      continue;
    }
    const col = `"${k}"`;
    if (v === null) {
      parts.push(`${col} IS NULL`);
      continue;
    }
    if (!isOps(v)) {
      parts.push(`${col} = ?`);
      args.push(writeArg(v));
      continue;
    }
    for (const [op, ov] of Object.entries(v)) {
      if (ov === undefined || op === "mode") continue;
      switch (op) {
        case "equals":
          if (ov === null) parts.push(`${col} IS NULL`);
          else {
            parts.push(`${col} = ?`);
            args.push(writeArg(ov));
          }
          break;
        case "not":
          if (ov === null) parts.push(`${col} IS NOT NULL`);
          else {
            parts.push(`${col} <> ?`);
            args.push(writeArg(ov));
          }
          break;
        case "in":
        case "notIn": {
          const list = (ov as unknown[]).filter((x) => x !== null && x !== undefined);
          parts.push(`${col} ${op === "in" ? "IN" : "NOT IN"} (${list.map(() => "?").join(", ")})`);
          args.push(...list.map(writeArg));
          break;
        }
        case "lt":
        case "lte":
        case "gt":
        case "gte":
          parts.push(`${col} ${{ lt: "<", lte: "<=", gt: ">", gte: ">=" }[op]} ?`);
          args.push(writeArg(ov));
          break;
        case "contains":
        case "startsWith":
        case "endsWith":
          parts.push(`${col} LIKE ? ESCAPE '\\'`);
          args.push(`${op === "startsWith" ? "" : "%"}${like(ov)}${op === "endsWith" ? "" : "%"}`);
          break;
        default:
          throw new Error(`Unsupported filter "${op}" on ${table}.${k}`);
      }
    }
  }
  return parts.join(" AND ");
}

export interface FindOpts {
  orderBy?: Record<string, "asc" | "desc">[];
  take?: number;
  skip?: number;
  select?: string[];
}

function findArgs(where: Row, opts?: FindOpts | Record<string, "asc" | "desc">): FindArgs {
  const args: FindArgs = { where: assertWhere(where) };
  if (!opts) return args;
  const o = opts as FindOpts;
  if ("orderBy" in o || "take" in o || "skip" in o || "select" in o) {
    if (o.orderBy?.length) args.orderBy = o.orderBy;
    if (o.take !== undefined) args.take = o.take;
    if (o.skip !== undefined) args.skip = o.skip;
    if (o.select?.length && !o.select.includes("*")) args.select = Object.fromEntries(o.select.map((c) => [c, true]));
  } else args.orderBy = opts as Record<string, "asc" | "desc">;
  return args;
}

function stripUndefined(row: Row): Row {
  const out: Row = {};
  for (const k in row) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

function hasIntId(table: string): boolean {
  return TABLES[table]?.id?.kind === "Int";
}

export function createDb(): Db {
  return new Db();
}

/** What ported code imported as `Prisma` (only DbNull is used). */
export const Prisma = { DbNull: null };

export function inList(values: readonly unknown[]): string {
  return values.length ? values.map(() => "?").join(", ") : "NULL";
}

export function assertWhere(where: Row): Row {
  for (const k in where) {
    const v = where[k];
    if (v === undefined) throw new Error(`Undefined binding(s) detected when compiling WHERE. Undefined column(s): [${k}]`);
    if (k === "AND" || k === "OR") (Array.isArray(v) ? v : [v]).forEach((x) => assertWhere(x as Row));
    else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      for (const op in v as Row) {
        const ov = (v as Row)[op];
        if (ov === undefined) throw new Error(`Undefined binding(s) detected when compiling WHERE. Undefined column(s): [${k}]`);
        if (Array.isArray(ov) && ov.some((x) => x === undefined))
          throw new Error(`Undefined binding(s) detected when compiling WHERE. Undefined column(s): [${k}]`);
      }
    }
  }
  return where;
}

// same as the server: computed columns keep mysql2's types
const fnAlias = (fn: string) =>
  new RegExp(String.raw`\b(?:${fn})\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s+as\s+[\x60"']?(\w+)`, "gi");
const ALIAS_RULES: [RegExp, RegExp, ColumnKind | null][] = [
  [/count\s*\(/i, fnAlias("count"), null],
  [/strftime\s*\(/i, fnAlias("strftime"), null],
  [/\bdate\s*\(/i, fnAlias("date"), "date"],
];
function aggregateSpec(text: string, spec?: RawSpec): RawSpec | undefined {
  let out: RawSpec | undefined;
  for (const [probe, re, kind] of ALIAS_RULES) {
    if (!probe.test(text)) continue;
    for (const m of text.matchAll(re)) (out ??= {})[m[1]] = kind;
  }
  return out ? { ...out, ...spec } : spec;
}
