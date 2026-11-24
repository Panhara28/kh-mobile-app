// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  ProducerSettlement,
  SettlementService,
} from "../../../classes/cinema/settlement";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const getSettlementList = withAuthApi<
  unknown,
  unknown,
  ResponseType<{ data: ProducerSettlement[]; total: number }>,
  {
    limit: number;
    offset: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    isSettled?: string;
  }
>(async ({ db, userAuth, searchParams }) => {
  const params = searchParams;
  const limit = params?.limit || 30;
  const offset = params?.offset || 0;
  const startDate = params?.startDate;
  const endDate = params?.endDate;
  const isSettled =
    params?.isSettled !== undefined
      ? params?.isSettled === "true"
        ? true
        : false
      : undefined;
  const settlementService = new SettlementService(db);
  const result = await settlementService.getSettlements(
    {
      limit,
      offset,
      startDate,
      endDate,
      isSettled,
    },
    userAuth.admin!,
  );

  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 },
  );
});
