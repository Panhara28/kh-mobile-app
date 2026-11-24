// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../../../db/db";
import { ProductOptionAndVariant } from "./types";
import { ProductService } from "../../../../classes/product-service";
import { UserInfo } from "../../../../lib/server-functions/get-auth-from-token";

export async function getProductOption(
  db: Db,
  productId: string,
  user: UserInfo
): Promise<ProductOptionAndVariant> {
  return await db.tx(async (trx) => {
    const productService = new ProductService(trx, user);
    const productOption = await productService.getProductOption(productId);
    const productVariant = await productService.getProductVariant(productId);
    const productVariantByWarehouse =
      await productService.getProductVariantByWarehouse(productId);
    return {
      options: productOption,
      variants: productVariant,
      byWarehouse: productVariantByWarehouse,
    };
  });
}
