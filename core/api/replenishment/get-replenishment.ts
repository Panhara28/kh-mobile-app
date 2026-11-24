// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  Replenishment,
  replenishmentFilterSchema,
  ReplenishmentFilterType,
  ReplenishmentService,
} from "../../classes/replenishment";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const getReplenishment = withAuthApi<
  unknown,
  unknown,
  ResponseType<{ total: number; data: Replenishment[] }>,
  ReplenishmentFilterType
>(async ({ db, searchParams, userAuth }) => {
  const params = replenishmentFilterSchema.parse(searchParams);

  const result = await new ReplenishmentService(
    db,
    userAuth.admin!
  ).getReplenishment(params);
  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 }
  );
});
