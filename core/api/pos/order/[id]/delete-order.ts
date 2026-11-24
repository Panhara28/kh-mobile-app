// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderService } from "../../../../classes/order";
import { PrintToKitchenService } from "../../../../classes/print-to-kitchen";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const deleteOrder = withAuthApi<
  { id: string },
  unknown,
  ResponseType<boolean>
>(async ({ db, params, logger, userAuth }) => {
  if (!params?.id) {
    return NextResponse.json(
      { success: false, message: "Order ID is required" },
      { status: 400 },
    );
  }

  console.log("Deleting order with ID:", params.id);

  const orderService = new OrderService(db);

  const isCompleted = await orderService.checkOrderCompleted(params.id);

  if (isCompleted) {
    throw new Error("Order already checkout");
  }

  // Tell the kitchen to stop anything still cooking for this order.
  if (userAuth.admin) {
    const kitchen = new PrintToKitchenService(db, userAuth.admin);
    const lines: { order_detail_id: string }[] = await db.rows("customer_order_detail", { order_id: params.id });
    for (const l of lines) await kitchen.printItemCancel(l.order_detail_id);
  }

  const result = await orderService.delete(params.id, logger);

  return NextResponse.json(
    {
      success: true,
      result: result,
    },
    { status: 200 },
  );
});
