// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ProductVariantConversionType } from "../classes/product-variant-conversion";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { groupBy } from "lodash-es";
import { LoaderFactory } from "./loader-factory";

export function createProductVariantConversionLoader(
  db: Db,
  warehouseId: string
) {
  return new DataLoader<string, ProductVariantConversionType[]>(
    async (keys) => {
      const rows = await db.p.product_variant_conversion.findMany({ where: { product_id: { in: [...keys] } } });

      const variantLoader = LoaderFactory.productVariantByIdLoader(
        db,
        warehouseId
      );

      const conversions: ProductVariantConversionType[] = await Promise.all(
        rows.map(async (row) => {
          return {
            fromVariant: await variantLoader.load(row.from_variant_id),
            toVariant: await variantLoader.load(row.to_variant_id),
            productId: row.product_id,
            conversionRate: row.conversion_rate,
          };
        })
      );

      const grouped = groupBy(conversions, "productId");
      return keys.map((key) => grouped[key] || []);
    }
  );
}
