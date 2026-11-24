// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const getHotHour = withAuthApi<
  unknown,
  unknown,
  ResponseType<unknown[]>,
  { startDate?: string; endDate?: string }
>(async ({ db, searchParams, userAuth }) => {
  const query = db
    .table("customer_order")
    .innerJoin(
      "customer_order_detail",
      "customer_order_detail.order_id",
      "customer_order.order_id"
    )
    .whereNotNull("customer_order.paid_at");

  if (searchParams?.startDate && searchParams?.endDate) {
    query.whereBetween("customer_order.paid_at", [
      searchParams.startDate,
      searchParams.endDate,
    ]);
  }

  if (userAuth.admin) {
    query.where(
      "customer_order.warehouse_id",
      userAuth.admin.currentWarehouseId
    );
  }

  const result = await query
    .clone()
    .select(
      db.raw("((CAST(strftime('%w', customer_order.paid_at) AS INTEGER) + 6) % 7) as week_of_day"),
      db.raw("CAST(strftime('%H', customer_order.paid_at) AS INTEGER) as hore_of_week"),
      db.raw("SUM(customer_order_detail.qty) as total_qty"),
      db.raw("SUM(customer_order_detail.total_amount) as total_amount")
    )
    .groupByRaw("((CAST(strftime('%w', customer_order.paid_at) AS INTEGER) + 6) % 7), CAST(strftime('%H', customer_order.paid_at) AS INTEGER)")
    .orderByRaw(
      "((CAST(strftime('%w', customer_order.paid_at) AS INTEGER) + 6) % 7), CAST(strftime('%H', customer_order.paid_at) AS INTEGER)"
    );

  return NextResponse.json(
    {
      success: true,
      result: result.map((x) => {
        return {
          ...x,
          total_qty: Number(x.total_qty),
          total_amount: Number(x.total_amount),
        };
      }),
      error: "",
    },
    { status: 200 }
  );
});
