// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { CinemaReservationService } from "../../../../classes/cinema/reservation";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const sendReservationSocket = withAuthApi<
  unknown,
  { ids: string[] },
  ResponseType<boolean>
>(async ({ db, body, userAuth }) => {
  const ids = body?.ids;

  const cinemaReservation = new CinemaReservationService(db, userAuth.admin!);

  const res = await cinemaReservation.sendReservationTicketToPrinter(ids || []);

  return NextResponse.json({ 
    success: res.success, 
    result: res.success, 
    error: res.error 
  }, { status: 200 });
});
