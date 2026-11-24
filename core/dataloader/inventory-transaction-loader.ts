// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_inventory_transactions } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { ProductVariantType } from "./product-variant-loader";
import { Slot } from "./slot-loader";
import { ProductLot } from "./product-lot";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import { Formatter } from "../lib/formatter";

export interface InventoryTransaction {
  id: string;
  transactionType: table_inventory_transactions["transaction_type"] | null;
  qty: number;
  variant: ProductVariantType | null;
  slot: Slot | null;
  productLot: ProductLot | null;
  createdBy: UserInfo | null;
  createdAt: string | null;
}

export function createInventoryTransactionLoader(
  db: Db,
  warehouseId: string
): DataLoader<string, InventoryTransaction | null> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows: table_inventory_transactions[] = await db.rows<table_inventory_transactions>("inventory_transactions", { id: { in: [...keys] } });

    const slotLoader = LoaderFactory.slotLoader(db);
    const lotLoader = LoaderFactory.productLotLoader(db);
    const userLoader = LoaderFactory.userLoader(db);
    const variantLoader = LoaderFactory.productVariantByIdLoader(
      db,
      warehouseId
    );

    return await Promise.all(
      keys.map(async (key) => {
        const transaction = rows.find((r) => r.id === key);
        if (!transaction) return null;
        return {
          id: transaction.id || "",
          transactionType: transaction.transaction_type,
          variant: transaction.variant_id
            ? await variantLoader.load(transaction.variant_id)
            : null,
          slot: transaction.slot_id
            ? await slotLoader.load(transaction.slot_id)
            : null,
          productLot: transaction.lot_id
            ? await lotLoader.load(transaction.lot_id)
            : null,
          qty: transaction.qty,
          createdBy: transaction.created_by
            ? await userLoader.load(transaction.created_by)
            : null,
          createdAt: Formatter.dateTime(transaction.created_at),
        };
      })
    );
  });
}
