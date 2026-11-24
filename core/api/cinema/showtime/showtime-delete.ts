// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ShowtimeService } from "../../../classes/cinema/showtime";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const deleteShowtime = withAuthApi<
  { id: string },
  unknown,
  ResponseType<unknown>
>(async ({ db, body, userAuth }) => {
  const showtimeService = new ShowtimeService(db, userAuth.admin!);
  await showtimeService.deleteShowtime((body as { id: string }).id);

  return NextResponse.json(
    { success: true, result: true, error: "" },
    { status: 200 }
  );
});
