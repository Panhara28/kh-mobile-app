// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  ReplenishmentCreateType,
  replenishmentInputSchema,
  ReplenishmentService,
} from "../../classes/replenishment";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const createReplenishment = withAuthApi<
  unknown,
  ReplenishmentCreateType,
  ResponseType<string>
>(async ({ db, userAuth, body }) => {
  const input = replenishmentInputSchema.parse(body);

  const replenishmentId = await new ReplenishmentService(
    db,
    userAuth.admin!
  ).createReplenishment(input);

  return NextResponse.json(
    {
      success: true,
      result: replenishmentId,
    },
    { status: 200 }
  );
});
