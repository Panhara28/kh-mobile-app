// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_warehouse_slot } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { Warehouse } from "./warehouse-loader";
import { LoaderFactory } from "./loader-factory";

export interface Slot {
  id: string;
  name: string;
  warehouse: Warehouse;
  posSlot: boolean;
  createdAt?: string;
  updatedAt?: string;
  forReplenishment?: boolean;
}

export function createSlotLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.warehouse_slot.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_warehouse_slot[];

    const warehouseLoader = LoaderFactory.warehouseLoader(db);

    return Promise.all(
      keys.map(async (key) => {
        const row = rows.find((r) => r.id === key);
        if (!row) return null;
        return {
          id: row.id || "",
          name: row.slot_name,
          warehouse: await warehouseLoader.load(row.warehouse_id),
          posSlot: row.pos_slot === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          forReplenishment: row.for_replenishment === 1,
        } as unknown as Slot;
      })
    );
  });
}
