// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../db/db";
import Dataloader from "../db/loader";
import { table_product_option_value } from "../generated/tables";
import { ProductOptionValue } from "../api/product/[id]/option/types";

export function createProductOptionValueLoader(db: Db) {
  return new Dataloader(async (keys: readonly string[]) => {
    const rows = (await db.p.product_option_value.findMany({
      where: { product_option_id: { in: [...keys] } },
    })) as unknown as table_product_option_value[];

    const productOptionValueMap: Record<string, ProductOptionValue[]> = {};

    rows.forEach((row) => {
      const optionValue = mapProductOptionValue(row);
      if (productOptionValueMap[row.product_option_id!]) {
        productOptionValueMap[row.product_option_id!].push(optionValue);
      } else {
        productOptionValueMap[row.product_option_id!] = [optionValue];
      }
    });
    return keys.map((key) => productOptionValueMap[key] || []);
  });
}

// Keyed by product_option_value.id
export function createProductOptionValueByIdLoader(db: Db) {
  return new Dataloader(async (keys: readonly string[]) => {
    const rows = (await db.p.product_option_value.findMany({ where: { id: { in: [...keys] } } })) as unknown as table_product_option_value[];

    const rowById = new Map(rows.map((r) => [r.id, r]));
    return keys.map((key) => {
      const row = rowById.get(key);
      return row ? mapProductOptionValue(row) : null;
    });
  });
}

function mapProductOptionValue(
  row: table_product_option_value
): ProductOptionValue {
  return {
    id: row.id!,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
