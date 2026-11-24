// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { ProductModifierType } from "./product-variant-loader";

export function createModifierByProductLoader(
  db: Db
): DataLoader<string, ProductModifierType[]> {
  return new DataLoader(async (keys: readonly string[]) => {
    const modifier = await db.p.product_modifier.findMany({ where: { product_id: { in: [...keys] } } });

    // modifierLoader only returns non-deleted modifiers (null otherwise)
    const modifierLoader = LoaderFactory.modifierLoader(db);

    return Promise.all(
      keys.map(async (key) => {
        const rows = modifier.filter((mod) => mod.product_id === key);
        const items = await Promise.all(
          rows.map((x) => modifierLoader.load(x.modifier_id)),
        );
        return items.filter(
          (item) => item !== null,
        ) as unknown as ProductModifierType[];
      })
    );
  });
}
