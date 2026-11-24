// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../../lib/formatter";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";
import { z } from "zod";

export const modifierSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      price: z.number(),
    })
  ),
});

export type inputModifierType = z.infer<typeof modifierSchema>;

export const deleteModifier = withAuthApi<
  { id: string },
  unknown,
  ResponseType<boolean | null>
>(async ({ db, userAuth, body }) => {
  const user = userAuth.admin!;
  await db.update("modifier", { modifier_id: (body as { id: string }).id }, {
      deleted_by: user.id,
      deleted_at: Formatter.getNowDateTime(),
      update_at: Formatter.getNowDateTime(),
      updated_by: user.id,
    });

  return NextResponse.json(
    {
      success: true,
      result: true,
    },
    { status: 200 }
  );
});
