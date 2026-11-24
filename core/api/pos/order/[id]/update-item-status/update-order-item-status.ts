// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderService } from "../../../../../classes/order";
import { OrderStatusService } from "../../../../../classes/order-status";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";
import { z } from "zod";

const UpdateOrderItemStatusSchema = z
  .array(
    z.object({
      orderDetailId: z.string(),
      fromStatus: z.enum(["pending", "cooking"]),
      toStatus: z.enum(["cooking", "served"]),
      qty: z.number().min(1),
    })
  )
  .min(1);

export type UpdateOrderItemStatusSchemaAPIInput = z.infer<
  typeof UpdateOrderItemStatusSchema
>;

const idSchema = z.object({
  id: z.string(),
});

// "pending" -> "cooking" queues a kitchen ticket; the server prints it on the item's network printer.
export type UpdateOrderItemStatusResponse = ResponseType<boolean>;

export const updateOrderItemStatusAPI = withAuthApi<
  { id: string },
  UpdateOrderItemStatusSchemaAPIInput,
  UpdateOrderItemStatusResponse
>(async ({ db, params, body, userAuth }) => {
  const order = new OrderService(db);

  const { id } = idSchema.parse(params);

  const isCompleted = await order.checkOrderCompleted(id);

  if (isCompleted) {
    throw new Error("Order already checkout");
  }

  const input = UpdateOrderItemStatusSchema.parse(body);

  const update = new OrderStatusService(db, userAuth.admin!);
  for (const item of input) {
    await update.updateOrderItemStatusUsingActualStatus(
      item.orderDetailId,
      item.qty,
      item.fromStatus,
      item.toStatus
    );
  }

  return NextResponse.json(
    { success: true },
    { status: 200 }
  );
});
