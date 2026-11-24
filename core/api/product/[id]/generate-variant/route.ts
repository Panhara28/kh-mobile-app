// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import {
  ProductOption,
  productOptionSchema,
  ProductVariant,
} from "../option/types";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";
import { generateVariant } from "./generate-product-variant";

export const POST = withAuthApi<
  unknown,
  ProductOption[],
  ResponseType<ProductVariant[]>
>(async ({ req, body }) => {
  const pathname = req.nextUrl.pathname.split("/");
  const productId = pathname[pathname.indexOf("product") + 1];
  if (!productId) {
    return NextResponse.json(
      { success: false, error: "Missing product ID" },
      { status: 400 }
    );
  }
  const optionInput = productOptionSchema.parse(body) as ProductOption[];
  // generate variant using product options
  const variants = generateVariant(optionInput);
  return NextResponse.json(
    {
      success: true,
      result: variants,
    },
    { status: 200 }
  );
});
