// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_modifier_items } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { LoaderFactory } from "./loader-factory";
import { ProductModifierItemType } from "./product-variant-loader";

export function createModifierItemByIdLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const modifierItems = (await db.p.modifier_items.findMany({
      where: { id: { in: [...keys] }, deleted_at: null },
    })) as unknown as table_modifier_items[];

    const userLoader = LoaderFactory.userLoader(db);

    return await Promise.all(
      keys.map(async (key) => {
        const item = modifierItems.find((item) => item.id === key);
        if (!item) {
          return null;
        }

        return {
          id: item.id,
          modifierId: item.modifier_id,
          name: item.name,
          price: Number(item.price || 0),
          createdAt: item.created_at
            ? Formatter.dateTime(item.created_at)
            : null,
          createdBy: item.created_by
            ? await userLoader.load(item.created_by)
            : null,
        } as ProductModifierItemType;
      })
    );
  });
}
