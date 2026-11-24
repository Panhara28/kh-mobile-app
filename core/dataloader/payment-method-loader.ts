// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_payment_method } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createPaymentMethodLoader(
  db: Db,
): DataLoader<string, table_payment_method | null> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.payment_method.findMany({ where: { method_id: { in: [...keys] } } })) as unknown as table_payment_method[];

    const rowById = new Map(rows.map((r) => [r.method_id, r]));
    return keys.map((key) => rowById.get(key) ?? null);
  });
}
