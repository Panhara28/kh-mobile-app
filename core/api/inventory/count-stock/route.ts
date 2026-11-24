// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  StockCountingProps,
  StockCountingService,
} from "../../../classes/stock-counting";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const inputSchema = z.object({
  variantId: z.string().nonempty(),
  slotId: z.string().nonempty(),
  stockLot: z
    .array(
      z.object({
        lot: z.object({
          id: z.string().nonempty(),
          lotNumber: z.string().optional(),
          expiredAt: z.string().optional(),
          manufacturedAt: z.string().optional(),
          costPerUnit: z.number().optional(),
        }),
        stock: z.number().min(0),
      })
    )
    .nonempty(),
});

export const POST = withAuthApi<
  unknown,
  StockCountingProps,
  ResponseType<boolean>
>(async ({ db, userAuth, body }) => {
  const stockCountingService = new StockCountingService(db, userAuth.admin!);

  const stockCountInfo: StockCountingProps = inputSchema.parse(
    body
  ) as unknown as StockCountingProps;

  const result = await stockCountingService.countStockByVariant(stockCountInfo);

  return NextResponse.json({ success: true, result }, { status: 200 });
});
