// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderReturn, OrderReturnService } from "../classes/order-return";
import { table_order_return } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createOrderReturnByOrderDetailLoader(
  db: Db
): DataLoader<string, OrderReturn[]> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.order_return.findMany({ where: { order_item_id: { in: [...keys] } } })) as unknown as table_order_return[];

    const results = await Promise.all(
      keys.map(async (key) => {
        const orderReturns = rows.filter((r) => r.order_item_id === key);
        return Promise.all(
          orderReturns.map((r) => OrderReturnService.map(r, db))
        );
      })
    );
    return results;
  });
}
