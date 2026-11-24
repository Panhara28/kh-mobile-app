// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Logger } from "../../logger";
import { WarehouseInput } from "../../types";
import type { Db } from "../../../db/db";
import { v4 } from "uuid";

export async function createWarehouse(
  db: Db,
  input: WarehouseInput,
  logger: Logger
) {
  try {
    return await db.tx(async (trx) => {
      const warehouseId = v4();
      const warehouseInput = {
        id: warehouseId,
        name: input.name,
        is_main: input.isMain,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const warehouseSlotInput = [];

      for (const slot of input.slot) {
        const slotInputData = {
          id: v4(),
          slot_name: slot.slotName,
          slot_capacity: slot.slotCapacity,
          slot_status: slot.slotStatus,
          created_at: new Date(),
          updated_at: new Date(),
          warehouse_id: warehouseId,
        };
        warehouseSlotInput.push(slotInputData);
        logger.serverLog("warehouse_slot:create", {
          action: "create",
          table_name: "warehouse_slot",
          key: slotInputData.id,
          content: slotInputData,
        });
      }

      await db.table("warehouse").insert(warehouseInput).transacting(trx as never);
      logger.serverLog("warehouse:create", {
        action: "create",
        table_name: "warehouse",
        key: warehouseId,
      });

      await db
        .table("warehouse_slot")
        .insert(warehouseSlotInput)
        .transacting(trx as never);

      return {
        success: true,
        result: { message: "Create warehouse" },
      };
    });
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
