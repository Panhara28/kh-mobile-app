// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { GroupProduct, ProductGroupService } from "../../../../../classes/product-group";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";

export const deleteProductFromGroup = withAuthApi<
  { id: string },
  GroupProduct[],
  ResponseType<unknown>
>(async ({ db, params, body }) => {
  const groupId = params?.id;
  const input = body;

  const productGroupService = new ProductGroupService(db);
  const result = await productGroupService.removeProductsFromGroup(
    groupId || "",
    input as GroupProduct[],
  );

  return NextResponse.json(
    {
      success: true,
      data: result,
    },
    { status: 200 },
  );
});
