// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  ReplenishmentService,
  replenishmentUpdateSchema,
  ReplenishmentUpdateType,
} from "../../classes/replenishment";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const updateReplenishment = withAuthApi<
  unknown,
  ReplenishmentUpdateType,
  ResponseType<boolean>
>(async ({ db, userAuth, body }) => {
  const input = replenishmentUpdateSchema.parse(body);

  const replenishmentService = new ReplenishmentService(db, userAuth.admin!);
  const result = await replenishmentService.updateReplenishment(input);

  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 }
  );
});
