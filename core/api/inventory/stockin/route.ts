// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { SlotMovementService } from "../../../classes/slot-movement";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { inputStockinSchema } from "./type";

export const POST = withAuthApi<
  unknown,
  unknown,
  ResponseType<boolean>,
  unknown
>(async ({ db, body, userAuth }) => {
  const input = inputStockinSchema.parse(body);

  await new SlotMovementService(db).stockin({
    ...input,
    createdBy: userAuth.admin!,
    productLot: { ...input.productLot, variantId: input.variantId },
    transactionType: "STOCK_IN",
  });

  return NextResponse.json({ success: true, result: true }, { status: 200 });
});
