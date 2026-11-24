// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { UndoCustomerOrderService } from "../../../../../classes/undo-customer-order";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";
import { z } from "zod";

const idSchema = z.object({
  id: z.string(),
});

export const PUT = withAuthApi<
  { id: string },
  unknown,
  ResponseType<{ orderId: string; tableNumber: string | null; tagNo?: string | null }>
>(async ({ params, db, userAuth }) => {
  const id = idSchema.parse(params).id;

  const service = new UndoCustomerOrderService(db, userAuth.admin!);
  const result = await service.undoOrderFromCompletedToDraft(id);

  return NextResponse.json({ success: true, result });
});
