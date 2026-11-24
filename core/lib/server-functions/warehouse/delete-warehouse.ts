// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_warehouse, table_warehouse_slot } from "../../../generated/tables";
import { Logger } from "../../logger";
import type { Db } from "../../../db/db";

export async function deleteWarehouse(db: Db, id: string) {
  try {
    await db.update("warehouse", { id: id }, { is_deleted: 1 });

    return {
      success: true,
      result: { message: "Delete warehouse #" + id },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export async function deleteWarehouseSlot(
  db: Db,
  id: string[],
  logger: Logger
) {
  try {
    await db.update("warehouse_slot", { id: { in: [...id] } }, { is_deleted: 1 });

    for (const slotId in id) {
      logger.log("warehouse_slot:delete", {
        action: "delete",
        table_name: "warehouse_slot",
        key: slotId,
      });
    }

    return {
      success: true,
      result: { message: "Delete slot warehouse " + id.join(",") },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
