// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_discount } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { Formatter } from "../lib/formatter";

export function createDiscountLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.discount.findMany({ where: { discount_id: { in: [...keys] } } })) as unknown as table_discount[];
    const warehouseLoader = LoaderFactory.warehouseLoader(db);
    const userLoader = LoaderFactory.userLoader(db);

    return keys.map(async (key) => {
      const discount = rows.find((d) => d.discount_id === key);
      if (!discount) return null;
      return {
        id: discount.discount_id,
        title: discount.title,
        description: discount.description,
        discountType: discount.discount_type,
        value: Number(discount.value),
        warehouseId: discount.warehouse_id,
        createdAt: Formatter.dateTime(discount.created_at),
        createdBy: discount.created_by
          ? await userLoader.load(discount.created_by)
          : null,
        updatedAt: Formatter.dateTime(discount.update_at),
        updatedBy: discount.updated_by
          ? await userLoader.load(discount.updated_by)
          : null,
        warehouse: discount.warehouse_id
          ? await warehouseLoader.load(discount.warehouse_id)
          : null,
        autoId: discount.auto_id,
      };
    });
  });
}
