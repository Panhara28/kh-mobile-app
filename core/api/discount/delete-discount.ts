// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { DiscountService } from "../../classes/discount";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const deleteDiscount = withAuthApi<
  unknown,
  { id: string },
  ResponseType<{ message: string }>
>(async ({ db, body, logger }) => {
  const discount = new DiscountService(db);
  await discount.delete(body?.id || "");
  logger.serverLog("discount:DELETE", {
    action: "delete",
    table_name: "discount",
    key: body?.id || "",
  });

  return NextResponse.json({
    success: true,
    result: { message: "Discount deleted" },
  });
});
