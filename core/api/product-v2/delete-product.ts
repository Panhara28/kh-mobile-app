// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ProductServiceV2 } from "../../classes/product-v2";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";
import { z } from "zod";

const deleteProductSchema = z.object({
  id: z.string().nonempty(),
});

export type DeleteProductInput = z.infer<typeof deleteProductSchema>;

export const deleteProduct = withAuthApi<
  unknown,
  DeleteProductInput,
  ResponseType<boolean>
>(async ({ db, body, userAuth }) => {
  const { id } = deleteProductSchema.parse(body);
  const productService = new ProductServiceV2(db, userAuth.admin!);
  const result = await productService.deleteProduct(id);
  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 }
  );
});
