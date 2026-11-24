// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderReturnService } from "../../../../classes/order-return";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";
import { z } from "zod";

const inputSchema = z.object({
  id: z.string(),
});

export const POST = withAuthApi<
  unknown,
  { id: string },
  unknown,
  ResponseType<boolean>
>(async ({ db, userAuth, body }) => {
  const { id } = inputSchema.parse(body);
  const orderReturnService = new OrderReturnService(db, userAuth.admin!);
  const result = await orderReturnService.stockInOrderReturn(id);

  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 }
  );
});
