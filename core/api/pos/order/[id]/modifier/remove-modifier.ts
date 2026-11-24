// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderModifierService } from "../../../../../classes/order-modifier";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";
import { z } from "zod";

const modifierSchema = z.object({
  orderDetailId: z.string(),
  modifierItemId: z.string(),
});

export const removeModifier = withAuthApi<
  unknown,
  { body: z.infer<typeof modifierSchema> },
  ResponseType<boolean>
>(async ({ db, userAuth, body }) => {
  const modifierService = new OrderModifierService(db, userAuth.admin!);
  const input = modifierSchema.parse(body);
  await modifierService.removeOrderModifier(input);
  return NextResponse.json({ success: true, result: true });
});
