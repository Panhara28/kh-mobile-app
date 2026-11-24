// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { InvoiceNumberService } from "../../../classes/invoice-number";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<number[]>,
  { n: number }
>(
  async ({ db, searchParams, userAuth }) => {
    const n = searchParams?.n || 1;
    const suggestedNumber = await new InvoiceNumberService(
      db,
      userAuth.admin! || {
        ...userAuth.customer!,
        currentWarehouseId: userAuth.customer!.warehouseId,
      }
    ).getNextInvoiceNumber(n);

    return NextResponse.json(
      {
        success: true,
        result: suggestedNumber,
      },
      { status: 200 }
    );
  },
  ["ADMIN", "CUSTOMER"]
);
