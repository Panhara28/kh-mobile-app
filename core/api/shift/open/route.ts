// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ShiftService } from "../../../classes/shift";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const inputSchema = z.object({
  openedCashUsd: z.number(),
  openedCashKhr: z.number(),
  exchangeRate: z.number(),
});

// Needs the role's "shift" permission (see api-permissions.ts). One open shift per branch: everyone in the branch
// checks out into it, so a second one is refused.
export const POST = withAuthApi<unknown, unknown, ResponseType<string>>(
  async ({ db, body, userAuth }) => {
    const { openedCashUsd, openedCashKhr, exchangeRate } =
      inputSchema.parse(body);
    const service = new ShiftService(db);
    const open = await service.getWorkingShift(
      userAuth.admin!.id,
      userAuth.admin!.currentWarehouseId,
    );
    if (open) {
      const by = open.openedBy?.fullname || open.openedBy?.username || "";
      return NextResponse.json(
        {
          success: false,
          error: `A shift is already open in this branch${by ? ` (opened by ${by})` : ""}.`,
        },
        { status: 400 },
      );
    }
    const shiftId = await service.openShift(
      userAuth.admin!.id,
      openedCashUsd,
      openedCashKhr,
      exchangeRate,
    );
    return NextResponse.json(
      { success: true, result: shiftId },
      { status: 200 },
    );
  },
);
