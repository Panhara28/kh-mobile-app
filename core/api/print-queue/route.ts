// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { PrintToKitchenService } from "../../classes/print-to-kitchen";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export type PrintToKitchenResponse = ResponseType<unknown>;

/**
 * Queues a kitchen ticket (resend, or test tickets). The kh-pos server prints queued tickets on the branch's
 * network printers (src/lib/printing/kitchen-queue.ts); there is no print app polling this route any more.
 */
export const POST = withAuthApi<
  unknown,
  { orderDetailId: string; qty: number; reprint?: boolean; testing?: boolean },
  PrintToKitchenResponse
>(async ({ db, userAuth, body }) => {
  const printToKitchenService = new PrintToKitchenService(db, userAuth.admin!);

  if (!!body?.testing) {
    await printToKitchenService.printTestContent(body?.qty || 0);
    return NextResponse.json({ success: true, result: true }, { status: 200 });
  }

  await printToKitchenService.printOrderToKitchen(
    body?.orderDetailId || "",
    body?.qty || 0,
    body?.reprint || false,
  );

  return NextResponse.json({ success: true, result: true }, { status: 200 });
});
