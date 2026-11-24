// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_customer_order } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { Order } from "../classes/order";

export function createOrderLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows: table_customer_order[] = await db.rows<table_customer_order>("customer_order", { order_id: { in: [...keys] } });

    const orderDetailLoader = LoaderFactory.orderDetailLoader(db, "");
    const customerLoader = LoaderFactory.customerLoader(db);

    const rowById = new Map(rows.map((r) => [r.order_id, r]));

    return await Promise.all(
      keys.map(async (key) => {
        const row = rowById.get(key);
        if (!row) return null;
        const [customerLoaderResult, items] = await Promise.all([
          row.customer_id ? customerLoader.load(row.customer_id) : null,
          row.order_id ? orderDetailLoader.load(row.order_id) : null,
        ]);
        return {
          ...row,
          customer: row.customer,
          customerLoader: customerLoaderResult,
          items,
        };
      }),
    );
  });
}

export function createOrderLoaderByCustomerId(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows: table_customer_order[] = await db.rows<table_customer_order>("customer_order", { customer_id: { in: [...keys] } }, { orderBy: [{ created_at: "desc" }], take: 10 });

    const orderDetailLoader = LoaderFactory.orderDetailLoader(db, "");
    const userLoader = LoaderFactory.userLoader(db);

    return await Promise.all(
      keys.map(async (key) => {
        const row = rows.filter((f) => f.customer_id === key);
        if (!row || row.length === 0) return null;
        return await Promise.all(
          row.map(async (r) => {
            return {
              invoiceNo: r.invoice_no || 0,
              orderId: r.order_id,
              orderStatus: r.order_status || "",
              createdAt: r.created_at,
              paidAt: r.paid_at,
              totalAmount: r.total_amount || "0",
              createdBy: r.created_by
                ? await userLoader.load(r.created_by)
                : null,
              customerId: r.customer_id,
              customerLoader: r.customer_id
                ? await LoaderFactory.customerLoader(db).load(r.customer_id)
                : null,
              customer: r.customer,
              printCount: r.print_time || 0,
              tableName: r.table_number || "",
              tableNumber: r.table_number || "",
              transferAt: r.transfer_at,
              servedType: r.served_type,
              deliveryCode: r.delivery_code,
              transferBy: r.transfer_by
                ? await userLoader.load(r.transfer_by)
                : null,
              items: r.order_id
                ? await orderDetailLoader.load(r.order_id)
                : null,
            } as Order;
          }),
        );
      }),
    );
  });
}
