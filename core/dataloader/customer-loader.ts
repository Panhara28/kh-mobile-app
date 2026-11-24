// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Customer } from "../classes/customer";
import { table_customer } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";

export function createCustomerLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.customer.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_customer[];

    const warehouseLoader = LoaderFactory.warehouseLoader(db);

    return Promise.all(keys.map(async (key) => {
      const row = rows.find((r) => r.id === key);

      if (!row) return null;

      return {
        id: row.id,
        customerName: row.customer_name,
        phone: row.phone,
        address: row.address,
        createdAt: Formatter.dateTime(row.created_at)!,
        createdBy: null,
        type: row.customer_type || "general",
        extraPrice: row.extra_price,
        warehouse: row.pos_warehouse_id
          ? await warehouseLoader.load(row.pos_warehouse_id)
          : null,
        email: row.email,
        photo: row.photo,
      } as Customer;
    }));
  });
}
