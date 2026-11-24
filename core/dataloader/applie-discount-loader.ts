// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_product_discount } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function appliedProductDiscountLoader(
  db: Db
): DataLoader<string, table_product_discount[]> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.product_discount.findMany({ where: { discount_id: { in: [...keys] } } })) as unknown as table_product_discount[];
    const discountMap: Record<string, table_product_discount[]> = {};

    await Promise.all(
      rows.map(async (x) => {
        if (!discountMap[x.discount_id]) {
          discountMap[x.discount_id] = [];
        }
        discountMap[x.discount_id].push(x);
      })
    );

    return keys.map((key) => discountMap[key] || []);
  });
}
