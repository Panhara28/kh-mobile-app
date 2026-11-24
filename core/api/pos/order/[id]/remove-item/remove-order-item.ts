// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderService } from "../../../../../classes/order";
import { PrintToKitchenService } from "../../../../../classes/print-to-kitchen";
import {
  assertCustomerOwnsOrder,
  assertItemInOrder,
  assertItemNotStarted,
  isCustomerRequest,
} from "../../../../../lib/server-functions/customer-scope";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";

export const removeOrderItem = withAuthApi<
  { id: string },
  { item_id: string },
  ResponseType<unknown>
>(
  async ({ db, params, body, userAuth }) => {
    // Customers remove only their own table's items, before the kitchen starts them.
    if (isCustomerRequest(userAuth)) {
      const orderId = params?.id || "";
      await assertCustomerOwnsOrder(db, userAuth, orderId);
      await assertItemInOrder(db, orderId, body?.item_id ?? "");
      await assertItemNotStarted(db, body?.item_id ?? "");
    }

    const startTime = Date.now();

    try {
      const orderId = params?.id || "";
      const itemId = body?.item_id ?? "";

      console.log(`[removeOrderItem] Starting - Order: ${orderId}, Item: ${itemId}`);

      if (!orderId || !itemId) {
        return NextResponse.json(
          { success: false, error: "Missing order ID or item ID" },
          { status: 400 }
        );
      }

      const order = new OrderService(db);

      // Check order status first
      console.log(`[removeOrderItem] Checking order completion status...`);
      const isCompleted = await order.checkOrderCompleted(orderId);
      if (isCompleted) {
        console.log(`[removeOrderItem] Order already completed`);
        return NextResponse.json(
          { success: false, error: "Order already checkout" },
          { status: 400 }
        );
      }

      // Delete the order item
      console.log(`[removeOrderItem] Deleting order item...`);
      // The kitchen may already be cooking it: tell them to stop.
      if (userAuth.admin) await new PrintToKitchenService(db, userAuth.admin).printItemCancel(itemId);
      await order.deleteOrderItem(orderId, itemId);

      const endTime = Date.now();
      console.log(`[removeOrderItem] Success - Duration: ${endTime - startTime}ms`);
      
      return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
      const endTime = Date.now();
      console.error(`[removeOrderItem] Error after ${endTime - startTime}ms:`, error);
      
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : "Failed to remove item" 
        },
        { status: 500 }
      );
    }
  },
  ["ADMIN", "CUSTOMER"],
);
