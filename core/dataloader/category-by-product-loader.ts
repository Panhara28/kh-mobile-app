// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../db/db";
import Dataloader from "../db/loader";
import { table_product_categories } from "../generated/tables";
import { ProductCategory } from "../repository/product-category-repository";
import { LoaderFactory } from "./loader-factory";

export function createCategoryByProductLoader(db: Db) {
  return new Dataloader(async (keys: readonly string[]) => {
    const rows = (await db.p.product_categories.findMany({
      where: { product_id: { in: [...keys] } },
      select: { category_id: true, product_id: true, id: true },
    })) as unknown as table_product_categories[];

    const categoryMap: Record<string, ProductCategory[]> = {};
    const categoryLoader = LoaderFactory.productCategoryLoader(db);
    await Promise.all(
      rows.map(async (row) => {
        const category = await categoryLoader.load(row.category_id);
        if (categoryMap[row.product_id]) {
          categoryMap[row.product_id].push({
            ...category!,
            categoryId: category?.id || '',
            id: row.id || ''
          });
        } else {
          categoryMap[row.product_id] = [{
            ...category!,
            categoryId: category?.id || '',
            id: row.id || ''
          }];
        }
      })
    );

    return keys.map((key) => categoryMap[key] || []);
  });
}
