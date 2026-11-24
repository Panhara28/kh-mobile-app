// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_user_role } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createRoleLoader(db: Db): DataLoader<string, unknown> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.user_role.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_user_role[];

    return keys.map(key => {
      const role = rows.find(u => u.id === key);
      if(role) {
        return {
          id: role.id,
          role: role.role
        }
      }
    })
  })
}