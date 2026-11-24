// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_user } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";

/**
 * Loads users by id. The login `token` is left out (empty) unless `withToken` is set: this loader fills in
 * "created by" / "updated by" in many answers, and a token there lets anyone who can read an order sign in as that
 * person. Only the bound-user list (the "switch warehouse" menu) needs the tokens.
 */
export function createUserLoader(
  db: Db,
  withToken = false
): DataLoader<string, UserInfo | null> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.user.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_user[];
    const warehouseLoader = LoaderFactory.warehouseLoader(db);

    return Promise.all(
      keys.map(async (key) => {
        const user = rows.find((u) => u.id === key && u.id !== undefined);
        if (!user) return null;
        return {
          id: user.id as string,
          username: user.username,
          phoneNumber: user.phone_number,
          token: withToken ? user.token : "",
          fullname: user.fullname ?? "",
          profile: user.profile ?? "",
          roleId: user.role_id,
          warehouseId: user.warehouse_id
            ? await warehouseLoader.load(user.warehouse_id)
            : null,
          createdAt: user.created_at,
        };
      })
    );
  });
}
