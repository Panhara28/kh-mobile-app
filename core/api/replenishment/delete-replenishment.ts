// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  replenishmentDeleteSchema,
  ReplenishmentDeleteType,
  ReplenishmentService,
} from "../../classes/replenishment";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const deleteReplenishment = withAuthApi<
  unknown,
  unknown,
  ResponseType<boolean>,
  ReplenishmentDeleteType
>(async ({ db, userAuth, body }) => {
  const input = replenishmentDeleteSchema.parse(body);

  const service = new ReplenishmentService(db, userAuth.admin!);

  const success = await service.deleteReplenishment(input);

  return NextResponse.json(
    {
      success: success,
    },
    { status: 200 }
  );
});
