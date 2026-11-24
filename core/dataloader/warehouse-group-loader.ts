// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";

export function createWarehouseGroupByGroupIdLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = await db.p.warehouse_groups.findMany({ where: { group_id: { in: [...keys] } } });

    const warehouseLoader = LoaderFactory.warehouseLoader(db);

    return Promise.all(
      keys.map((key) => {
        const x = rows.filter((u) => u.group_id === key);
        if (!x) return [];
        return Promise.all(
          x.map(async (y) => {
            return {
              groupId: y.group_id,
              warehouseId: y.warehouse_id,
              warehouse: y.warehouse_id
                ? await warehouseLoader.load(y.warehouse_id)
                : null,
            };
          }),
        );
      }),
    );
  });
}
