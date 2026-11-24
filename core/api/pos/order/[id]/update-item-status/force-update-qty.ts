// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderService } from "../../../../../classes/order";
import { OrderStatusService } from "../../../../../classes/order-status";
import {
  assertCustomerOwnsOrder,
  assertItemInOrder,
  ForbiddenError,
  isCustomerRequest,
} from "../../../../../lib/server-functions/customer-scope";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";
import { z } from "zod";

const UpdateOrderItemStatusSchema = z.object({
  orderDetailId: z.string(),
  status: z.enum(["pending", "cooking", "served"]),
  qty: z.number().min(0),
});

export type UpdateOrderItemStatusSchemaInput = z.infer<
  typeof UpdateOrderItemStatusSchema
>;

const idSchema = z.object({
  id: z.string(),
});

export const forceUpdateQtyByStatus = withAuthApi<
  { id: string },
  UpdateOrderItemStatusSchemaInput,
  ResponseType<boolean>
>(
  async ({ db, params, body, userAuth }) => {
    const order = new OrderService(db);

    const { id } = idSchema.parse(params);

    const isCompleted = await order.checkOrderCompleted(id);

    if (isCompleted) {
      throw new Error("Order already checkout");
    }

    const input = UpdateOrderItemStatusSchema.parse(body);

    // Customers only change how many portions of their own items are still waiting
    // ("pending"); cooking and served are for staff.
    if (isCustomerRequest(userAuth)) {
      await assertCustomerOwnsOrder(db, userAuth, id);
      await assertItemInOrder(db, id, input.orderDetailId);
      if (input.status !== "pending") {
        throw new ForbiddenError("Only staff can change cooking or served items");
      }
      input.qty = z.number().int().min(0).max(999).parse(input.qty);
    }

    const update = new OrderStatusService(
      db,
      userAuth.admin! || {
        ...userAuth.customer,
        currentWarehouseId: userAuth.customer?.warehouseId || "",
      }
    );
    await update.forceUpdateOrderItemStatusQty({
      orderItemId: input.orderDetailId,
      status: input.status,
      qty: input.qty,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  },
  ["ADMIN", "CUSTOMER"]
);
