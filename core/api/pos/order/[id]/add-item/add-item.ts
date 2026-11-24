// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  assertCustomerOwnsOrder,
  isCustomerRequest,
  menuPriceOf,
} from "../../../../../lib/server-functions/customer-scope";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { NextResponse } from "../../../../../next-compat/server";
import { OrderService } from "../../../../../classes/order";
import { z } from "zod";
import { discountInputSchema } from "../../../../discount/create-discount";

export const inputOrderItemSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string(),
  qty: z.number(),
  price: z.string(),
  discountAmount: z.string(),
  discount: z.array(discountInputSchema).optional(),
  reservation: z
    .array(
      z.object({
        showtimeId: z.string(),
        seatId: z.string(),
        price: z.number(),
        code: z.string().optional(),
      })
    )
    .optional(),
});

export const addOrderItem = withAuthApi<{ id: string }>(
  async ({ db, body, params, userAuth }) => {
    const input = inputOrderItemSchema.parse(body);

    // Customers add to their own table's open order, at menu prices, whole portions only.
    if (isCustomerRequest(userAuth)) {
      await assertCustomerOwnsOrder(db, userAuth, params?.id || "");
      input.qty = z.number().int().min(1).max(999).parse(input.qty);
      input.price = await menuPriceOf(db, input.variantId);
      input.discountAmount = "0";
      input.discount = undefined;
      input.reservation = undefined;
    }

    const order = new OrderService(db);

    const isCompleted = await order.checkOrderCompleted(params?.id || "");

    if (isCompleted) {
      throw new Error("Order already checkout");
    }

    const res = await order.addOrderItem(
      params?.id || "",
      input,
      userAuth.admin! || {
        ...userAuth.customer!,
        currentWarehouseId: userAuth.customer!.warehouseId,
      }
    );

    return NextResponse.json({ success: true, result: res }, { status: 200 });
  },
  ["ADMIN", "CUSTOMER"]
);
