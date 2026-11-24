// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import DataLoader from "../db/loader";
import { inList, type Db } from "../db/db";

export interface VariantStock {
  variantId: string;
  stock: number;
  slotStock: {
    slotId: string;
    slotName: string;
    posSlot: boolean;
    stock: number;
  }[];
}

export function createVariantStockLoader(
  db: Db,
  warehouseId: string,
  forReplenishment?: boolean
) {
  return new DataLoader(async (keys: readonly string[]) => {
    const slotWhere = forReplenishment ? "warehouse_id = ? AND for_replenishment = 1" : "warehouse_id = ?";
    const [slots, stockRows] = await Promise.all([
      db.query<{ id: string; slot_name: string; pos_slot: number }>(
        `SELECT id, slot_name, pos_slot FROM warehouse_slot WHERE ${slotWhere}`,
        [warehouseId],
      ),
      db.query<{ variant_id: string; slot_id: string; stock: unknown }>(
        `SELECT variant_id, slot_id, SUM(qty) AS stock FROM inventory
         WHERE variant_id IN (${inList(keys)}) AND slot_id IN (SELECT id FROM warehouse_slot WHERE ${slotWhere})
         GROUP BY variant_id, slot_id`,
        [...keys, warehouseId],
        // MySQL SUM() returns DECIMAL, which mysql2 sent as a string
        { stock: { kind: "decimal", scale: 0 } },
      ),
    ]);

    const slotById = new Map(slots.map((s) => [s.id, s]));
    const rows = stockRows.map((row) => ({
      ...row,
      slot_name: slotById.get(row.slot_id)?.slot_name,
      pos_slot: slotById.get(row.slot_id)?.pos_slot,
    }));

    return keys.map((key) => {
      const x = rows.filter((u) => u.variant_id === key);
      if (x.length === 0) return null;
      return {
        variantId: x[0].variant_id,
        stock: x.reduce((sum, row) => sum + (Number(row.stock) || 0), 0),
        slotStock: x.map((row) => ({
          slotId: row.slot_id,
          slotName: row.slot_name,
          posSlot: row.pos_slot === 1,
          stock: row.stock || 0,
        })),
      } as VariantStock;
    });
  });
}
