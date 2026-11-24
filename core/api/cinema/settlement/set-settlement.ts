// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { SettlementService } from "../../../classes/cinema/settlement";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const setSettlement = withAuthApi<
  unknown,
  {
    settlementId: string;
    proofLink: string;
  },
  ResponseType<unknown>
>(async ({ db, userAuth, body }) => {
  const { settlementId, proofLink } = body!;
  const settlementService = new SettlementService(db);

  const result = await settlementService.settleProducerSettlement(
    { settlementId, proofLink },
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
