// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  CinemaReservationService,
  SeatReservation,
} from "../../../../classes/cinema/reservation";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const getReservationByCode = withAuthApi<
  unknown,
  unknown,
  ResponseType<SeatReservation[]>,
  {
    code?: string;
    customerPhone?: string;
  }
>(async ({ db, userAuth, searchParams }) => {
  const params = searchParams;
  const code = params?.code || "";
  const customerPhone = params?.customerPhone || "";
  const reservationService = new CinemaReservationService(db, userAuth.admin!);

  const res = await reservationService.getReservationByCode({
    code,
    customerPhone,
  });

  return NextResponse.json(
    {
      success: true,
      result: res ?? undefined,
      error: undefined,
    },
    { status: 200 },
  );
});
