// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ProductServiceV2, ProductV2 } from "../../../classes/product-v2";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<Record<string, ProductV2[]>>
>(async ({ db, userAuth }) => {
  const productService = new ProductServiceV2(db, userAuth.admin!);

  const product = await productService.groupProductByCategory();

  return NextResponse.json(
    {
      success: true,
      result: product,
    },
    { status: 200 }
  );
});
