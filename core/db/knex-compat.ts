// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * Query builder for the multi-table / dynamic queries of the legacy services (joins, reports, filters built up
 * conditionally). knex is used ONLY as a SQL compiler here: it has no driver and no connection. Every builder
 * and raw statement is compiled to SQLite SQL and executed through the `Db` it came from, i.e. Prisma
 * `$queryRawUnsafe` / `$executeRawUnsafe` on the libSQL adapter, inside that Db's transaction if it has one,
 * with the same mysql2-shaped value coercion as the rest of the data layer.
 *
 * Results keep the shapes the code was written against (knex + mysql2):
 *   select -> rows, first -> row | undefined, pluck -> values, insert -> [insertId], update/del/increment ->
 *   affected count, raw SELECT -> [rows, fields], raw write -> [{ affectedRows }].
 */
import knexFactory, { type Knex } from "knex";
import type { Db } from "./db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;
const DB = Symbol("kh.db");

const compiler: Knex = knexFactory({
  client: "sqlite3",
  useNullAsDefault: true,
  log: { warn() {}, deprecate() {}, debug() {}, error: (m: unknown) => console.error(m) },
});

const READ_SQL = /^\s*(\(?\s*select|with|pragma|values|explain)\b/i;

async function run(builder: AnyBuilder): Promise<unknown> {
  const db: Db | undefined = builder[DB];
  if (!db) throw new Error("Query builder is not bound to a Db (use db.table(...) / db.raw(...))");

  const method: string = builder._method ?? "raw";
  const single = builder._single ?? {};

  // Plain inserts go through the Prisma model (column validation, ids like mysql2's [insertId]).
  if (method === "insert" && single.table && typeof single.table === "string" && !single.onConflict && !single.returning && !single.ignore) {
    const data = single.insert;
    if (data && typeof data === "object" && !(Array.isArray(data) && data.some((r) => !r || typeof r !== "object" || hasRawValue(r))) && !hasRawValue(data)) {
      return db.insert(single.table, data);
    }
  }

  const { sql, bindings } = builder.toSQL().toNative() as { sql: string; bindings: unknown[] };
  if (!sql) return method === "raw" ? [[], []] : [];

  switch (method) {
    case "first":
      return (await db.query(sql, [...bindings]))[0];
    case "pluck": {
      const col = String(single.pluck).split(".").pop()!.split(/\s+as\s+/i).pop()!;
      return (await db.query(sql, [...bindings])).map((r: Record<string, unknown>) => r[col]);
    }
    case "insert":
    case "update":
    case "del":
    case "counter": {
      if (single.returning) return db.query(sql, [...bindings]);
      const n = await db.exec(sql, [...bindings]);
      return method === "insert" ? [0] : n;
    }
    case "raw": {
      if (READ_SQL.test(sql) || /\breturning\b/i.test(sql)) return [await db.query(sql, [...bindings]), []];
      const affectedRows = await db.exec(sql, [...bindings]);
      return [{ affectedRows, insertId: 0 }, undefined];
    }
    default:
      return db.query(sql, [...bindings]);
  }
}

function hasRawValue(row: object): boolean {
  return Object.values(row).some((v) => v && typeof v === "object" && (v as { isRawInstance?: boolean }).isRawInstance);
}

// Route execution of every builder / raw of this compiler through run().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (compiler as any).client;
client.runner = (builder: AnyBuilder) => ({ run: () => run(builder) });

// clone() must keep the Db binding; transacting(trx) rebinds the builder to that transaction's Db.
const qbProto = Object.getPrototypeOf(compiler.queryBuilder());
const origClone = qbProto.clone;
qbProto.clone = function (this: AnyBuilder) {
  const c = origClone.call(this);
  c[DB] = this[DB];
  return c;
};
qbProto.transacting = function (this: AnyBuilder, trx: Db) {
  this[DB] = trx;
  return this;
};
qbProto.forUpdate = function (this: AnyBuilder) {
  // SQLite serializes writers; row locks are not needed (and not supported).
  return this;
};
qbProto.skipLocked = qbProto.noWait = qbProto.forShare = qbProto.forUpdate;

function bind<T>(b: T, db: Db): T {
  (b as AnyBuilder)[DB] = db;
  return b;
}

/** The knex-like surface a `Db` exposes: db.table(), db.raw(), db.fn, db.ref(), db.select(), db.with(). */
export function knexSurface(db: Db) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table<TRecord extends {} = any, TResult = any[]>(name: string | Knex.Raw | Knex.AliasDict): Knex.QueryBuilder<TRecord, TResult> {
      return bind(compiler.table(name as string) as Knex.QueryBuilder<TRecord, TResult>, db);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw<TResult = any>(sql: string, bindings?: Knex.RawBinding | Knex.RawBinding[] | Knex.ValueDict): Knex.Raw<TResult> {
      return bind(bindings === undefined ? compiler.raw<TResult>(sql) : compiler.raw<TResult>(sql, bindings as never), db);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryBuilder<TRecord extends {} = any, TResult = any[]>(): Knex.QueryBuilder<TRecord, TResult> {
      return bind(compiler.queryBuilder<TRecord, TResult>(), db);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(...args: any[]): Knex.QueryBuilder {
      return bind(compiler.select(...args), db);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    with(alias: string, q: any): Knex.QueryBuilder {
      return bind(compiler.with(alias, q), db);
    },
  };
}

export const fn = compiler.fn;
export const ref = compiler.ref.bind(compiler);
export type { Knex };
