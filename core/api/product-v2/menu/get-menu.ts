// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ProductService } from "../../../classes/product-service";
import withDatabaseApi from "../../../lib/server-functions/with-database-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import {
  ProductSearchFilter,
  productSearchFilterSchema,
  ProductSearchResult,
} from "../../product/search-product/types";

export const getMenu = withDatabaseApi<
  unknown,
  unknown,
  ResponseType<ProductSearchResult[]>,
  ProductSearchFilter
>(async ({ db, searchParams }) => {
  const result = await db.tx(async (trx) => {
    const productService = new ProductService(trx);

    const filter = productSearchFilterSchema.parse(searchParams);
    // This endpoint is public: back-office filters (not-for-sale items, suppliers,
    // replenishment) are not available here.
    return await productService.searchProduct({
      ...filter,
      limit: Math.min(Number(filter.limit) || 10, 100),
      offset: Number(filter.offset) || 0,
      replenishment: false,
      supplierId: undefined,
      categoryKeys: filter.categoryKeys
        ? filter.categoryKeys?.split(",")
        : undefined,
      includeProductNotForSale: false,
      compositeOnly: filter.compositeOnly === "true",
    });
  });
  return NextResponse.json(
    { success: true, result: result.map(withoutCosts) },
    { status: 200 },
  );
});

/** Cost prices are business data; the public menu only shows selling prices. */
function withoutCosts(product: ProductSearchResult): ProductSearchResult {
  return {
    ...product,
    purchasedCost: undefined,
    variants: product.variants?.map((v) => ({ ...v, purchasePrice: null })),
  };
}
