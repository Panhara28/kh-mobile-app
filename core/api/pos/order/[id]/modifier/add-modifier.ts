// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderModifierService } from "../../../../../classes/order-modifier";
import {
  assertCustomerOwnsOrder,
  assertItemInOrder,
  assertItemNotStarted,
  isCustomerRequest,
  modifierPriceOf,
} from "../../../../../lib/server-functions/customer-scope";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";
import { z } from "zod";

const modifierSchema = z.object({
  orderDetailId: z.string(),
  modifierItemId: z.string(),
  price: z.number().min(0),
  notes: z.string().max(500).optional(),
});

export const addOrderModifier = withAuthApi<
  { id: string },
  { body: z.infer<typeof modifierSchema> },
  ResponseType<boolean>
>(
  async ({ db, userAuth, body, params }) => {
    const modifierService = new OrderModifierService(
      db,
      userAuth.admin! || {
        ...userAuth.customer!,
        currentWarehouseId: userAuth.customer!.warehouseId,
      }
    );
    const input = modifierSchema.parse(body);

    // Customers change only their own table's items, at menu prices (notes are free).
    if (isCustomerRequest(userAuth)) {
      const orderId = params?.id || "";
      await assertCustomerOwnsOrder(db, userAuth, orderId);
      await assertItemInOrder(db, orderId, input.orderDetailId);
      await assertItemNotStarted(db, input.orderDetailId);
      input.price = await modifierPriceOf(db, input.modifierItemId);
    }
    await modifierService.addOrderModifier(input);
    return NextResponse.json({ success: true, result: true });
  },
  ["ADMIN", "CUSTOMER"]
);
