// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * Makes Prisma + SQLite values look exactly like what mysql2 + MySQL gave the old kh-pos code, so the ported
 * business logic and every API response keep their behaviour:
 *
 *   DATETIME / TIMESTAMP  stored "YYYY-MM-DD HH:mm:ss" (Phnom Penh)  -> read as Date (local time, like mysql2)
 *   DATE                  stored "YYYY-MM-DD"                         -> read as Date at local midnight
 *   TIME                  stored "HH:mm:ss"                           -> read as string (like mysql2)
 *   DECIMAL(p,s)          stored REAL                                 -> read as fixed-scale string "12.50" (like mysql2)
 *   TINYINT(1)            stored 0/1                                  -> read as number 0/1 (like mysql2)
 *
 * Writes accept what knex accepted: Date objects, booleans, numeric strings.
 * process.env.TZ is pinned to Asia/Phnom_Penh at boot (main.ts), so local time is Phnom Penh time everywhere.
 */
import columnTypes from "../common/column-types.json";
// SQL NULL for a JSON column (Prisma.DbNull on the server)
const Prisma = { DbNull: null };

export type ColumnKind = "datetime" | "date" | "time" | "decimal" | "json" | "boolean" | "enum" | "String" | "Int" | "Float" | "bigint";
interface ColumnSpec {
  kind: ColumnKind | string;
  scale?: number;
}
type TableSpec = Record<string, ColumnSpec>;

export const TABLES = columnTypes as unknown as Record<string, TableSpec>;

/** Column name -> spec, for raw SQL results (joins, aliases). Ambiguous names resolve to the special kind. */
const BY_NAME: Record<string, ColumnSpec> = (() => {
  const out: Record<string, ColumnSpec> = {};
  const rank = (k: string) => (k === "datetime" || k === "date" ? 3 : k === "decimal" ? 2 : k === "json" ? 1 : 0);
  for (const cols of Object.values(TABLES)) {
    for (const [name, spec] of Object.entries(cols)) {
      if (!out[name] || rank(spec.kind) > rank(out[name].kind)) out[name] = spec;
    }
  }
  // `value` is DECIMAL in one table, TEXT/JSON in others (setting.value): never coerce it by name.
  delete out.value;
  delete out.amount_text;
  return out;
})();

const pad = (n: number) => (n < 10 ? "0" + n : "" + n);

/** Date -> "YYYY-MM-DD HH:mm:ss" in local (Phnom Penh) time, what MySQL DATETIME stored. */
export function toDbDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function toDbDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;
const D_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocal(value: string): Date | string {
  let m = DT_RE.exec(value);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  m = D_RE.exec(value);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return value;
}

export function readValue(spec: ColumnSpec | undefined, v: unknown): unknown {
  if (v === null || v === undefined || !spec) return v;
  switch (spec.kind) {
    case "datetime":
    case "date":
      return typeof v === "string" ? parseLocal(v) : v;
    case "decimal":
      if (typeof v === "number") return v.toFixed(spec.scale ?? 0);
      if (typeof v === "bigint") return Number(v).toFixed(spec.scale ?? 0);
      return v;
    case "json":
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return v;
    case "boolean":
      return typeof v === "boolean" ? (v ? 1 : 0) : v;
    default:
      return typeof v === "bigint" ? Number(v) : v;
  }
}

/** Coerce one row read through Prisma Client (table known). */
export function readRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const spec = TABLES[table];
  if (!spec) return row;
  for (const k in row) {
    const s = spec[k];
    if (s && s.kind !== "json") row[k] = readValue(s, row[k]); // Prisma already parses Json fields
  }
  return row;
}

/** Coerce rows from raw SQL: by column name. `overrides` decides ambiguous / aliased columns. */
export function readRawRows<T>(rows: Record<string, unknown>[], overrides?: Record<string, ColumnSpec | ColumnKind | null>): T[] {
  for (const row of rows) {
    for (const k in row) {
      let spec: ColumnSpec | undefined;
      if (overrides && k in overrides) {
        const o = overrides[k];
        spec = o === null ? undefined : typeof o === "string" ? { kind: o } : o;
      } else spec = BY_NAME[k];
      row[k] = readValue(spec, row[k]);
    }
  }
  return rows as T[];
}

/** Convert one value written by ported knex code into what SQLite stores. */
export function writeValue(spec: ColumnSpec | undefined, v: unknown): unknown {
  if (v === undefined) return v;
  if (v === null) return null;
  if (v instanceof Date) return spec?.kind === "date" ? toDbDate(v) : toDbDateTime(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (spec) {
    switch (spec.kind) {
      case "decimal":
      case "Float":
        if (typeof v === "string") return v.trim() === "" ? null : Number(v);
        return v;
      case "Int":
      case "boolean":
        if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
        return v;
      case "String":
      case "enum":
      case "datetime":
      case "date":
      case "time":
        if (typeof v === "number") return String(v);
        return v;
      case "json":
        return v;
    }
  }
  return v;
}

/** Raw SQL args: what the mysql2 driver accepted (Date, boolean, objects as JSON). */
export function writeArg(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return toDbDateTime(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v !== null && typeof v === "object" && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v;
}

/** Convert a Prisma `data` / `where` object for a table. Operators ({ in: [...] }, { gte }) are handled too. */
export function writeData(table: string, data: unknown, isWhere = false): unknown {
  const spec = TABLES[table];
  if (!spec || data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((d) => writeData(table, d, isWhere));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k === "AND" || k === "OR" || k === "NOT") {
      out[k] = Array.isArray(v) ? v.map((x) => writeData(table, x, isWhere)) : writeData(table, v, isWhere);
      continue;
    }
    const s = spec[k];
    if (!s) {
      out[k] = v;
      continue;
    }
    if (s.kind === "json") {
      if (isWhere) out[k] = v;
      // Prisma needs DbNull for SQL NULL in a Json field
      else if (v === null) out[k] = Prisma.DbNull;
      // MySQL parsed a JSON string written to a JSON column; Prisma would store it as a JSON string literal.
      else if (typeof v === "string") {
        try {
          out[k] = JSON.parse(v);
        } catch {
          out[k] = v;
        }
      } else out[k] = v;
      continue;
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      const ops: Record<string, unknown> = {};
      for (const [op, ov] of Object.entries(v as Record<string, unknown>)) {
        ops[op] = Array.isArray(ov) ? ov.map((x) => writeValue(s, x)) : op === "mode" ? ov : writeValue(s, ov);
      }
      out[k] = ops;
    } else out[k] = writeValue(s, v);
  }
  return out;
}
