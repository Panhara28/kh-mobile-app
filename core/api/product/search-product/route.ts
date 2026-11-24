// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import {
  ProductSearchFilter,
  productSearchFilterSchema,
  ProductSearchResult,
} from "./types";

import { ProductService } from "../../../classes/product-service";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<ProductSearchResult[]>,
  ProductSearchFilter
>(async ({ db, userAuth, searchParams }) => {
  const result = await db.tx(async (trx) => {
    const productService = new ProductService(trx, userAuth.admin!);

    const filter = productSearchFilterSchema.parse(searchParams);
    return await productService.searchProduct({
      ...filter,
      limit: Number(filter.limit) || 10,
      offset: Number(filter.offset) || 0,
      replenishment: filter.replenishment === "true",
      categoryKeys: filter.categoryKeys
        ? filter.categoryKeys?.split(",")
        : undefined,
      includeProductNotForSale: filter.includeProductNotForSale === "true",
      compositeOnly: filter.compositeOnly === "true",
    });
  });
  return NextResponse.json({ success: true, result }, { status: 200 });
});
