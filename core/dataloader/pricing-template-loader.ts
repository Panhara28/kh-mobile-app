// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_pricing_template } from "../generated/tables";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";

export function createPricingTemplateLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = (await db.p.pricing_template.findMany({
      where: { deleted_at: null, template_id: { in: [...keys] } },
    })) as unknown as table_pricing_template[];

    return await Promise.all(
      keys.map(async (key) => {
        const row = rows.find((row) => row.template_id === key);

        if (!row) return null;

        return {
          id: row.template_id || "",
          templateName: row.template_name,
          timeSlot: row.time_slot,
          dayType: row.day_type,
          extraSeatPrices: row.extra_seat_prices || null,
        };
      })
    );
  });
}
