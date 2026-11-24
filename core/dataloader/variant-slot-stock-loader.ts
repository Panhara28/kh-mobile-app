// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import DataLoader from "../db/loader";
import { inList, type Db } from "../db/db";

export interface VariantSlotStock {
  variantId: string;
  slotId: string;
  stock: number;
}

export function createVariantSlotStockLoader(
  db: Db,
  warehouseId: string,
) {
  return new DataLoader(async (keys: readonly string[]) => {
    // key = variantId_slotId
    const variantIds = keys.map((key) => key.split("_")[0]);
    const slotIds = keys.map((key) => key.split("_")[1]);
    const rows = await db.query<{ variant_id: string; slot_id: string; stock: number }>(
      `SELECT variant_id, slot_id, SUM(qty) AS stock FROM inventory
       WHERE variant_id IN (${inList(variantIds)}) AND slot_id IN (${inList(slotIds)})
         AND slot_id IN (SELECT id FROM warehouse_slot WHERE warehouse_id = ?)
       GROUP BY variant_id, slot_id`,
      [...variantIds, ...slotIds, warehouseId],
      { stock: null },
    );

    return keys.map((key) => {
      const x = rows.find((u) => u.variant_id === key.split("_")[0] && u.slot_id === key.split("_")[1]);
      if (!x) return null;
      return {
        variantId: x.variant_id,
        slotId: x.slot_id,
        stock: Number(x.stock | 0),
      } as VariantSlotStock;
    });
  });
}
