// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { CinemaReservationService } from "../../../../classes/cinema/reservation";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const updateStatusReservation = withAuthApi<
  unknown,
  {
    status: "pending" | "confirmed" | "admitted" | "cancelled" | "expired";
    code: string;
  },
  ResponseType<boolean>
>(async ({ db, userAuth, body, params }) => {
  const showtimeId = (params as { id: string })?.id;
  const status = (body as { status: string }).status as
    | "pending"
    | "confirmed"
    | "admitted"
    | "cancelled"
    | "expired";
  const code = (body as { code: string }).code;

  const cinemaReservation = new CinemaReservationService(db, userAuth.admin!);

  const res = await cinemaReservation.changeReservationStatus(
    showtimeId,
    code,
    status
  );

  return NextResponse.json(
    {
      success: res.success,
      result: res.result,
      error: res.error,
    },
    { status: 200 }
  );
});
