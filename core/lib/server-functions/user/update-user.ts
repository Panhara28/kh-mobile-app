// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { UserInput } from "../../types";
import type { Db } from "../../../db/db";

export async function updateUser(db: Db, input: UserInput) {
  try {
    return await db.tx(async (trx) => {
      const userInput = {
        fullname: input.fullname,
        phone_number: input.phoneNumber,
        profile: input.profile,
        role_id: input.roleId || "",
        warehouse_id: input.warehouseId || "",
      };

      await db
        .table("user")
        .where({ id: input.id })
        .update(userInput)
        .transacting(trx as never);

      return {
        success: true,
        result: { message: "Update user #" + input.id },
      };
    });
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
