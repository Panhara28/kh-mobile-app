// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_supplier } from "../generated/tables";
import { Supplier } from "../lib/server-functions/supplier";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createSupplierLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.supplier.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_supplier[];

    const result: Supplier[] = keys.map((key) => {
      const row = rows.find((f) => f.id === key);
      return {
        id: row?.id || "",
        name: row?.name || "",
        address: row?.address || "",
        updatedAt: row?.updated_at || "",
        note: row?.note || "",
        contactEmail: row?.contact_email || "",
        contactName: row?.contact_name || "",
        contactPhone: row?.contact_phone || "",
        isConsignment: row?.is_consignment === 1,
        createdAt: row?.created_at || "",
      };
    });

    return result;
  });
}
