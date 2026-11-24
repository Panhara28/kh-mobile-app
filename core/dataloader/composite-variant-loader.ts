// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import DataLoader from "../db/loader";
import { ProductVariantType } from "./product-variant-loader";
import { groupBy } from "lodash-es";
import { table_variant_composite } from "../generated/tables";
import { LoaderFactory } from "./loader-factory";
import type { Db } from "../db/db";

export interface CompositeVariant {
  id: string;
  componentVariant: ProductVariantType;
  qty?: number;
}

export function createCompositeVariantLoader(
  db: Db,
  warehouseId: string
): DataLoader<string, CompositeVariant[]> {
  return new DataLoader(async (keys: readonly string[]) => {
    const variants = (await db.p.variant_composite.findMany({
      where: { variant_composite_id: { in: [...keys] }, deleted_at: null },
    })) as unknown as table_variant_composite[];

    const groupedVariants = groupBy(variants, "variant_composite_id");
    const variantLoader = LoaderFactory.productVariantByIdLoader(
      db,
      warehouseId
    );
    return Promise.all(
      keys.map(async (key) => {
        const items = groupedVariants[key] || [];
        return Promise.all(
          items.map(
            async (variant) =>
              ({
                id: variant.id,
                componentVariant: await variantLoader.load(
                  variant.variant_component_id
                ),
                qty: variant.qty,
              } as CompositeVariant)
          )
        );
      })
    );
  });
}
