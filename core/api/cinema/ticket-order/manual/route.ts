// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  TicketOrderSchema,
  TicketOrderSchemaType,
  TicketOrderService,
} from "../../../../classes/cinema/ticket-order";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const POST = withAuthApi<
  unknown,
  TicketOrderSchemaType,
  ResponseType<boolean>
>(async ({ db, userAuth, logger, body }) => {
  const input = TicketOrderSchema.parse(body);

  const ticketOrderService = new TicketOrderService(
    db,
    userAuth.admin!,
    logger,
  );

  const res = await ticketOrderService.uploadManualTicketOrders(input);

  return NextResponse.json(
    { success: true, result: res, error: "" },
    { status: 200 },
  );
});
