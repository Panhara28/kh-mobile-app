// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_modifier, table_modifier_items } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

// Modifiers are also served to the public menu, so staff details (created_by) are not loaded here.
export function createModifierItemLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const modifierItems: table_modifier_items[] = await db.rows("modifier_items", { AND: [{ modifier_id: { in: [...keys] } }, { deleted_at: null }] });

    return keys.map((key) =>
      modifierItems
        .filter((item) => item.modifier_id === key)
        .map((x) => {
          return {
            id: x.id,
            modifierId: x.modifier_id,
            name: x.name,
            price: Number(x.price || 0),
            createdAt: x.created_at ? Formatter.dateTime(x.created_at) : null,
            createdBy: null,
          };
        })
    );
  });
}

export function createModifierLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const modifier: table_modifier[] = await db.rows("modifier", { AND: [{ modifier_id: { in: [...keys] } }, { deleted_at: null }] });

    const modifierItemsLoader = createModifierItemLoader(db);

    return await Promise.all(
      keys.map(async (key) => {
        const row = modifier.find((mod) => mod.modifier_id === key);

        if (!row) return null;

        return {
          ...row,
          modifierId: row.modifier_id,
          title: row.title,
          description: row.description,
          createdAt: row.created_at ? Formatter.dateTime(row.created_at) : null,
          createdBy: null,
          items: await modifierItemsLoader.load(key),
        };
      })
    );
  });
}
