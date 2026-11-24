// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

const COST = `CASE WHEN inventory_transactions.id IS NULL
  THEN coalesce(product_variant.purchased_cost, 0) * coalesce(all_orders.qty, 0)
  ELSE -coalesce(inventory_transactions.qty, 0) * coalesce(product_lot.cost_per_unit, 0) END`;

export const metricsList = withAuthApi<unknown, unknown, ResponseType<unknown>>(
  async ({ db, userAuth, req }) => {
    const user = userAuth.admin!;
    const param = req.nextUrl.searchParams;
    const startDate = String(param.get("startDate") || "");
    const endDate = String(param.get("endDate") || "");

    const allOrdersSubquery = db.table("customer_order_detail")
      .select(["customer_order_detail.*", "customer_order.paid_at"])
      .innerJoin(
        "customer_order",
        "customer_order_detail.order_id",
        "customer_order.order_id"
      )
      .where("customer_order.warehouse_id", user.currentWarehouseId)
      .where({ "customer_order.order_status": "COMPLETED" });

    if (startDate && endDate) {
      allOrdersSubquery.whereBetween("customer_order.paid_at", [
        startDate,
        endDate,
      ]);
    }

    const mainQuery = await db
      .with("all_orders", allOrdersSubquery)
      .from("all_orders")
      .select([
        "all_orders.order_detail_id",
        "all_orders.total_amount",
        // Stock items cost what their lots cost; items with no stock movement (made-to-order dishes,
        // untracked items) cost the variant's set cost, as the sales report does.
        db.raw(`${COST} as cost`),
        db.raw(`all_orders.total_amount - ${COST} as total_with_cost`),
        db.raw("strftime('%Y-%m-%d', all_orders.paid_at) as paid_at"),
      ])
      .leftJoin(
        "fulfilment_detail",
        "all_orders.order_detail_id",
        "fulfilment_detail.order_detail_id"
      )
      .leftJoin(
        "inventory_transactions",
        "inventory_transactions.id",
        "fulfilment_detail.transaction_id"
      )
      .leftJoin(
        "product_lot",
        "product_lot.id",
        "inventory_transactions.lot_id"
      )
      .leftJoin("product_variant", "product_variant.id", "all_orders.variant_id");

    const items = mainQuery.map((x: any) => {
      return {
        date: x.paid_at,
        orderDetailId: x.order_detail_id,
        sale: x.total_amount,
        cost: x.cost,
        profit: x.total_with_cost,
      };
    });

    return NextResponse.json(
      { success: true, result: items, error: "" },
      { status: 200 }
    );
  }
);
