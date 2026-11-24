// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const removeBindProduct = withAuthApi<
  { id: string },
  { productId: string },
  ResponseType<boolean>
>(async ({ db, params, body, logger }) => {
  const id = params?.id;
  const productId = body?.productId;

  if (!id || !productId) {
    return NextResponse.json(
      { success: false, error: "Missing parameters" },
      { status: 400 },
    );
  }

  await db.del("product_modifier", { AND: [{ product_id: productId }, { modifier_id: id }] });

  logger.serverLog("modifier:unbind-product", {
    action: "delete",
    table_name: "product_modifier",
    key: id,
    content: { modifierId: id, productId },
  });

  return NextResponse.json({ success: true, result: true }, { status: 200 });
});
