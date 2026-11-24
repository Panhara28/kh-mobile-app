// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  ProductGroupInputSchema,
  ProductGroupInputType,
  ProductGroupService,
} from "../../../classes/product-group";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const createProductGroup = withAuthApi<
  unknown,
  ProductGroupInputType,
  ResponseType<unknown>
>(async ({ db, body, userAuth }) => {
  const input = ProductGroupInputSchema.parse(body);
  const productGroupService = new ProductGroupService(db);

  const result = await productGroupService.createProductGroup(
    input,
    userAuth.admin!,
  );

  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 },
  );
});
