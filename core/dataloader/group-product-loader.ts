// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import DataLoader from "../db/loader";

export function createGroupProductByGroupIdLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = await db.p.group_products.findMany({ where: { group_id: { in: [...keys] } } });

    const productLoader = LoaderFactory.basicProductLoader(db);
    const variantLoader = LoaderFactory.productVariantByIdLoader(db);

    return Promise.all(
      keys.map((key) => {
        const x = rows.filter((u) => u.group_id === key);
        if (!x) return [];
        return Promise.all(
          x.map(async (y) => {
            return {
              groupId: y.group_id,
              productId: y.product_id,
              productVariantId: y.product_variant_id,
              product: y.product_id
                ? await productLoader.load(y.product_id)
                : null,
              variant: y.product_variant_id
                ? await variantLoader.load(y.product_variant_id)
                : null,
            };
          }),
        );
      }),
    );
  });
}
