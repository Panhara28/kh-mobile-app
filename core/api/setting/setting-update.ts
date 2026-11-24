// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { assertTableStyleFree, parseTableMode } from "../../classes/table-mode";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
// next/cache revalidatePath: the web app reads settings with a short revalidate window instead (separate app now).
import { NextResponse } from "../../next-compat/server";
import { z } from "zod";

const inputSettingSchema = z.object({
  id: z.number(),
  option: z.string().optional(),
  value: z.string(),
});

export type inputSettingType = z.infer<typeof inputSettingSchema>;

export const settingUpdate = withAuthApi<
  inputSettingType,
  unknown,
  ResponseType<unknown>
>(async ({ db, body, userAuth }) => {
  const input = inputSettingSchema.parse(body);

  const setting = await db.rows("setting", { id: input.id });

  // The table style can't change under open table orders.
  const current = setting.length > 1 ? setting.find((s) => s.warehouse === userAuth.admin?.currentWarehouseId) : setting[0];
  if (current?.option === "TYPE_POS" && current.warehouse && parseTableMode(current.value).mode !== parseTableMode(input.value).mode) {
    await assertTableStyleFree(db, current.warehouse);
  }

  await db
    .table("setting")
    .where(
      setting.length > 1
        ? {
            id: input.id,
            warehouse: userAuth.admin?.currentWarehouseId,
          }
        : {
            id: input.id,
          },
    )
    .update({ value: input.value });

  // (was revalidatePath("/", "layout"))

  return NextResponse.json({ success: true, result: input }, { status: 200 });
});
