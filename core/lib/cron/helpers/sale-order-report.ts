// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../../db/db";

interface SaleFilter {
  startDate: string;
  endDate: string;
}

export async function querySaleOrderReport(db: Db, filter: SaleFilter) {
  const query = db
    .table("customer_order")
    .join(
      "customer_order_detail",
      "customer_order_detail.order_id",
      "customer_order.order_id",
    )
    .join("warehouse", "warehouse.id", "customer_order.warehouse_id")
    .groupBy("customer_order.warehouse_id");

  if (filter.startDate && filter.endDate) {
    query.whereBetween("customer_order.paid_at", [
      filter.startDate,
      filter.endDate,
    ]);
  }

  const rows = await query.select(
    db.raw("SUM(customer_order_detail.total_amount) as total_amount"),
    "customer_order.warehouse_id",
    "warehouse.name",
    db.raw("DATE(customer_order.paid_at) as paid_date"),
  );

  if (rows.length === 0) {
    return [];
  }

  return rows;
}
