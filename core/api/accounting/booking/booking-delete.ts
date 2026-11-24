// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { AccountBookingService } from "../../../classes/accounting/account-booking";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const deleteBooking = withAuthApi<
  { id: string },
  unknown,
  ResponseType<unknown>
>(async ({ db, body, userAuth }) => {
  const id = (body as { id: string }).id;

  const accountBookingService = new AccountBookingService(db);

  const result = await accountBookingService.deleteAccountBooking(
    id,
    userAuth.admin!,
  );
  return NextResponse.json(result, { status: 200 });
});
