// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { ChartOfAccount } from "../api/accounting/chart-of-account/route";

export function createChartOfAccountsLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = await db.p.chart_of_account.findMany({ where: { id: { in: [...keys] } } });

    const userLoader = LoaderFactory.userLoader(db);

    return Promise.all(keys.map(async (key) => {
      const row = rows.find((r) => r.id === key);

      if (!row) return null;

      return {
        id: row.id,
        accountName: row.account_name,
        accountType: row.account_type,
        createdAt: row.created_at,
        createdBy: row.created_by ? await userLoader.load(row.created_by) : null,
      } as ChartOfAccount;
    }));
  });
}
