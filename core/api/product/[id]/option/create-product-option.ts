// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../../../db/db";
import { ProductOptionAndVariant } from "./types";
import { ProductService } from "../../../../classes/product-service";
import { UserInfo } from "../../../../lib/server-functions/get-auth-from-token";

export async function createProductOption(
  db: Db,
  productId: string,
  input: ProductOptionAndVariant,
  user: UserInfo
): Promise<ProductOptionAndVariant> {
  await db.tx(async (trx) => {
    const productService = new ProductService(trx, user);
    // handle product option
    for (const option of input.options) {
      await productService.createProductOption(productId, option);
    }

    // handle product variant
    const productVariant = input.variants;
    for (const variant of productVariant) {
      // Create product variant
      await productService.createProductVariant(
        productId,
        variant,
        variant.optionValues
      );
    }

    // handle product variant by warehouse
    if (input.byWarehouse.length > 0) {
      const productVariantByWarehouse = input.byWarehouse;
      for (const variantByWarehouse of productVariantByWarehouse) {
        await productService.createProductVariantByWarehouse(
          productId,
          variantByWarehouse
        );
      }
    }
  });
  return input;
}
