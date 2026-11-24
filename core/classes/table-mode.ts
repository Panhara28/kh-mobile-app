// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../db/db";
import { HttpError } from "../lib/server-functions/customer-scope";

/** NORMAL: one open order per table. TAG: several groups share a table, each order has its own tag. */
export type TableMode = "NORMAL" | "TAG";
export const DEFAULT_TAG_COUNT = 50;
export const MAX_TAG_COUNT = 999;

export function parseTableMode(value?: string | null): { mode: TableMode; tagCount: number } {
  try {
    const v = JSON.parse(value || "{}");
    const count = Number(v.tag_count);
    return {
      mode: v.system_type === "RESTAURANT" && v.table_mode === "TAG" ? "TAG" : "NORMAL",
      tagCount: Number.isInteger(count) && count > 0 ? Math.min(count, MAX_TAG_COUNT) : DEFAULT_TAG_COUNT,
    };
  } catch {
    return { mode: "NORMAL", tagCount: DEFAULT_TAG_COUNT };
  }
}

export async function getTableMode(db: Db, warehouseId?: string | null) {
  if (!warehouseId) return parseTableMode(null);
  const row = await db.row("setting", { option: "TYPE_POS", warehouse: warehouseId });
  return parseTableMode(row?.value);
}

/** Tables can't change style while groups are sitting: their orders would no longer fit. */
async function hasOpenTableOrders(db: Db, warehouseId: string) {
  return !!(await db.first(
    "SELECT 1 AS found FROM customer_order WHERE warehouse_id = ? AND order_status = 'DRAFT' AND table_number <> '' LIMIT 1",
    [warehouseId],
  ));
}

export async function assertTableStyleFree(db: Db, warehouseId: string) {
  if (await hasOpenTableOrders(db, warehouseId)) {
    throw new HttpError(409, "Close all open table orders before changing the table style.");
  }
}

export const formatTag = (n: number) => String(n).padStart(3, "0");

async function openTags(db: Db, warehouseId: string): Promise<Set<string>> {
  const rows = await db.query<{ tag_no: string }>(
    "SELECT tag_no FROM customer_order WHERE warehouse_id = ? AND order_status = 'DRAFT' AND tag_no <> ''",
    [warehouseId],
  );
  return new Set(rows.map((r) => r.tag_no));
}

/** The tag to store ("5" -> "005"), refused when it isn't one of the branch's tags or another open order has it. */
export async function claimTag(db: Db, warehouseId: string, tagCount: number, tag: string): Promise<string> {
  const n = Number(tag);
  if (!/^\d+$/.test(tag) || n < 1 || n > tagCount) throw new HttpError(400, `The tag must be a number from 1 to ${tagCount}`);
  const tagNo = formatTag(n);
  if ((await openTags(db, warehouseId)).has(tagNo)) throw new HttpError(409, `Tag ${tagNo} is already in use`);
  return tagNo;
}

export async function lowestFreeTag(db: Db, warehouseId: string, tagCount: number): Promise<string> {
  const used = await openTags(db, warehouseId);
  for (let n = 1; n <= tagCount; n++) if (!used.has(formatTag(n))) return formatTag(n);
  throw new HttpError(409, "All tags are in use");
}

/** Sets the table to taken while an open order is on it, else to `whenEmpty`. */
export async function refreshTableStatus(db: Db, tableId: string, whenEmpty: "available" | "cleaning") {
  const open = await db.row("customer_order", { table_number: tableId, order_status: "DRAFT" });
  await db.update("restaurant_tables", { id: tableId }, { status: open ? "order_taken" : whenEmpty });
}
