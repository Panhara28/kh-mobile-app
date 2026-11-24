// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import ProductCategoryRepository from "../repository/product-category-repository";
import Dataloader from "../db/loader";
import type { Db } from "../db/db";

export function createProductCategoryLoader(db: Db) {
  return new Dataloader(async (keys: readonly string[]) => {
    const rows = await new ProductCategoryRepository(db).findByIds(keys);
    const categories = rows.map((row) => ProductCategoryRepository.map(row!));

    return keys.map((key) => {
      const category = categories.find((c) => c.id === key);
      return category || null;
    });
  });
}
