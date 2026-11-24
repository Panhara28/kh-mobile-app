// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_order_detail_modifier } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export interface OrderModifierType {
  orderDetailId: string;
  modifierItemId: string;
  price?: number;
  notes?: string;
}

export function createOrderModifierLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.order_detail_modifier.findMany({
      where: { order_detail_id: { in: [...keys] } },
    })) as unknown as table_order_detail_modifier[];
    const orderModifiers = rows.map((row) => ({
      orderDetailId: row.order_detail_id,
      modifierItemId: row.modifier_item_id,
      price: row.price ? Number(row.price) : undefined,
      notes: row.notes ?? undefined,
    }));
    const modifierMap = new Map<string, OrderModifierType[]>();
    orderModifiers.forEach((modifier) => {
      if (!modifierMap.has(modifier.orderDetailId)) {
        modifierMap.set(modifier.orderDetailId, []);
      }
      modifierMap.get(modifier.orderDetailId)!.push(modifier);
    });
    return keys.map((key) => modifierMap.get(key));
  });
}
