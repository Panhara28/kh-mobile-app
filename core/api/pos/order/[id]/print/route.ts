// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { z } from "zod";
import { OrderService } from "../../../../../classes/order";
import { NextResponse } from "../../../../../next-compat/server";

const idSchema = z.object({
  id: z.string(),
});

export const POST = withAuthApi<{ id: string }, unknown, ResponseType<string>>(
  async ({ db, params }) => {
    const { id } = idSchema.parse(params);

    const orderService = new OrderService(db);
    await orderService.orderPrintTime(id);

    return NextResponse.json(
      {
        success: true,
        result: id,
      },
      { status: 200 }
    );
  }
);
