// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { KitchenLog, KitchenResend } from "../classes/order";
import { Formatter } from "../lib/formatter";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createKitchenLogByOrderDetailLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = await db.p.print_kitchen_log.findMany({ where: { order_detail_id: { in: [...keys] } } });

    const logMap: Record<string, KitchenLog[]> = {};

    await Promise.all(
      rows.map(async (x) => {
        if (!logMap[x.order_detail_id!]) {
          logMap[x.order_detail_id!] = [];
        }
        logMap[x.order_detail_id!].push({
          orderId: x.order_id,
          orderDetailId: x.order_detail_id,
          itemPrice: x.item_price,
          printedAt: Formatter.dateTime(x.printed_at),
        });
      }),
    );

    return keys.map((key) => logMap[key] || []);
  });
}

/** "Resend to Kitchen" actions per order line: who resent it and how many portions, oldest first. */
export function createKitchenResendByOrderDetailLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = await db.p.print_resend_log.findMany({ where: { order_detail_id: { in: [...keys] } }, orderBy: { id: "asc" } });

    const map: Record<string, KitchenResend[]> = {};
    for (const r of rows) {
      (map[r.order_detail_id] ??= []).push({
        by: r.resent_by_name || "?",
        qty: r.qty,
        resentAt: r.created_at,
      });
    }
    return keys.map((key) => map[key] || []);
  });
}
