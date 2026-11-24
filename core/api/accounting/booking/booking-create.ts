// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  AccountBookingService,
  SchemaAccountBooking,
  TypeSchemaAccountBooking,
} from "../../../classes/accounting/account-booking";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const createBooking = withAuthApi<
  unknown,
  TypeSchemaAccountBooking,
  ResponseType<unknown>
>(async ({ db, userAuth, body }) => {
  const input = SchemaAccountBooking.parse(body);

  const accountBookingService = new AccountBookingService(db);

  const result = await accountBookingService.createAccountBooking(
    input,
    userAuth.admin!,
  );

  return NextResponse.json(result, { status: 200 });
});
