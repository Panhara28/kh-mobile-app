// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { SettlementService } from "../../../classes/cinema/settlement";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const generateSettlement = withAuthApi<
  unknown,
  {
    startDate: string;
    endDate: string;
  },
  ResponseType<unknown>
>(async ({ db, userAuth, body }) => {
  const { startDate, endDate } = body!;
  const settlementService = new SettlementService(db);

  const result = await settlementService.generateSettlement(
    {
      startDate,
      endDate,
    },
    userAuth.admin!,
  );

  return NextResponse.json(
    {
      success: true,
      result,
    },
    {
      status: 200,
    },
  );
});
