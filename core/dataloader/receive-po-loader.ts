// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_receive_po_detail, table_supplier_purchase_order } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";

export function createSupplierPurchaseOrderLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.supplier_purchase_order.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_supplier_purchase_order[];

    return Promise.all(
      keys.map(async key => {
        const row = rows.find(f => f.id === key);
        if(!row) return null
        return row
      })
    )
  })
}

export function createReceivedPOLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.receive_po.findMany({ where: { id: { in: [...keys] } } })) as unknown as Record<string, any>[];

    const po = LoaderFactory.supplierPurchaseOrderLoader(db);

    return Promise.all(
      keys.map(async key => {
        const row = rows.find(f => f.id === key);
        if(!row) return null
        return {
          ...row,
          po: row.po_Id ? await po.load(row.po_Id) : null
        }
      })
    )
  })
}

export function receivePOBytransactionIDLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.receive_po_detail.findMany({ where: { transaction_id: { in: [...keys] } } })) as unknown as table_receive_po_detail[];

    const receivePOLoader = LoaderFactory.receivePOLoader(db);

    return Promise.all(
      keys.map(async key => {
        const row = rows.find(f => f.transaction_id === key);
        if(!row) return null
        return {
          ...row,
          receive: row.receive_id ? await receivePOLoader.load(row.receive_id) : null
        }
      })
    )
  })
}