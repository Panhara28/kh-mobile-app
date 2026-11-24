// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ShiftService } from "../../../classes/shift";
import { LoaderFactory } from "../../../dataloader/loader-factory";
import { table_shift } from "../../../generated/tables";
import { Formatter } from "../../../lib/formatter";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import type { ShiftType } from "../route";

/**
 * The shift the logged-in user works in: their own open shift, otherwise the branch's open shift
 * (ShiftService.getWorkingShift). Same row shape as GET /api/shift. `result` is null when the branch has none.
 */
export const GET = withAuthApi<unknown, unknown, ResponseType<ShiftType | null>>(
  async ({ db, userAuth }) => {
    const service = new ShiftService(db);
    const working = await service.getWorkingShift(
      userAuth.admin!.id,
      userAuth.admin!.currentWarehouseId,
    );
    if (!working) {
      return NextResponse.json({ success: true, result: null }, { status: 200 });
    }
    const row: table_shift = await db.row("shift", { shift_id: working.shiftId });
    const userLoader = LoaderFactory.userLoader(db);
    const result: ShiftType = {
      ...row,
      opened_at: row.opened_at ? Formatter.dateTime(row.opened_at) : null,
      closed_at: row.closed_at ? Formatter.dateTime(row.closed_at) : null,
      opened_by: row.opened_by ? await userLoader.load(row.opened_by) : null,
      closed_by: row.closed_by ? await userLoader.load(row.closed_by) : null,
      receipt: await service.getShiftReceipt(row.shift_id!, 0, 0),
    } as ShiftType;
    return NextResponse.json({ success: true, result }, { status: 200 });
  },
);
