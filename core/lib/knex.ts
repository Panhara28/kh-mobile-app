// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createDb, type Db } from "../db/db";

/** Former knex singleton accessor (cron jobs, favicon): now a Db on the shared Prisma client. */
export function getKnexSync(): Db {
  return createDb();
}
export const getKnex = async (): Promise<Db> => createDb();
export default getKnex;
