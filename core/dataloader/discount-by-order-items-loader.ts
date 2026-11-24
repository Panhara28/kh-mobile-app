// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_discount_log } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export interface CustomerOrderDiscount {
  id: string;
  discountId: string;
  orderDetailId: string;
  amount: number;
  name: string;
  discountType?: "PERCENTAGE" | "AMOUNT";
  value?: number;
  createdAt?: string;
  isManualDiscount?: boolean;
}

export function createDiscountByOrderItemLoader(
  db: Db
): DataLoader<string, CustomerOrderDiscount[]> {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.discount_log.findMany({ where: { order_detail_id: { in: [...keys] } } })) as unknown as table_discount_log[];

    const discountMap: Record<string, CustomerOrderDiscount[]> = {};
    rows.forEach((row) => {
      if (!discountMap[row.order_detail_id!]) {
        discountMap[row.order_detail_id!] = [];
      }
      discountMap[row.order_detail_id!].push({
        id: row.id,
        discountId: row.discount_id!,
        orderDetailId: row.order_detail_id!,
        amount: Number(row.discount_amount || 0),
        name: row.discount_title || "",
        discountType: row.discount_type || undefined,
        value: Number(row.value || 0),
        createdAt: row.created_at || undefined,
        isManualDiscount: row.is_manual_discount === 1,
      });
    });

    return keys.map((key) => discountMap[key] || []);
  });
}
