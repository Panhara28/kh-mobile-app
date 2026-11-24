// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ShiftService } from "../../../classes/shift";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const inputSchema = z.object({
  actualCashUsd: z.number(),
  actualCashKhr: z.number(),
  shiftId: z.string(),
});

export const POST = withAuthApi<unknown, unknown, ResponseType<boolean>>(
  async ({ db, body, userAuth }) => {
    const { actualCashUsd, actualCashKhr, shiftId } = inputSchema.parse(body);
    const result = await new ShiftService(db).closeShift(
      userAuth.admin!.id,
      shiftId,
      actualCashUsd,
      actualCashKhr
    );
    return NextResponse.json({ success: true, result }, { status: 200 });
  }
);
