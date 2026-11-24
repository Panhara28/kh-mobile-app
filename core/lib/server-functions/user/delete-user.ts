// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_user } from "../../../generated/tables";
import type { Db } from "../../../db/db";

export default async function deleteUser(db: Db, id: string) {
  try {
    await db.update("user", { id: id }, { is_deleted: 1 });

    return {
      success: true,
      result: { message: "Delete user #" + id },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * @deprecated no longer in use
 */
export async function deleteUserRoles(db: Db, id: string[]) {
  try {
    await db.update("user_roles", { id: { in: [...id] } }, { is_deleted: 1 });

    return {
      success: true,
      result: { message: "Delete role user " + id.join(",") },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
