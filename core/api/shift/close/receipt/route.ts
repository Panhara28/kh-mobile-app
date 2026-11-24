// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ShiftService } from "../../../../classes/shift";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<unknown>,
  { id: string }
>(async ({ db, searchParams }) => {
  const id = searchParams?.id || "";

  const result = await new ShiftService(db).getShiftReceipt(id, 0, 0);

  return NextResponse.json({ success: true, result }, { status: 200 });
});
