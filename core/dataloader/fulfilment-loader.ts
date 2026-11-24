// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_fulfilment, table_fulfilment_detail } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";

export function createFulfilmentLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.fulfilment.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_fulfilment[];

    const orderLoader = LoaderFactory.orderLoader(db);

    return await Promise.all(
      keys.map(async key => {
        const row = rows.find(f => f.id === key);
        if(!row) return null
        return {
          ...row,
          order: row.order_id ? await orderLoader.load(row.order_id || '') : null
        };
      })
    )
  })
}

export function createFulfilmentDetailByTransactionIDLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.fulfilment_detail.findMany({ where: { transaction_id: { in: [...keys] } } })) as unknown as table_fulfilment_detail[];
    
    const fulfilmentLoader = LoaderFactory.fulfilmentLoader(db);

    return await Promise.all(
      keys.map(async key => {
        const row = rows.find(f => f.transaction_id === key);
        if(!row) return null;
        return {
          ...row,
          fulfilment: row.fulfilment_id ? await fulfilmentLoader.load(row.fulfilment_id || '') : null,
        }
      })
    )
  })
}