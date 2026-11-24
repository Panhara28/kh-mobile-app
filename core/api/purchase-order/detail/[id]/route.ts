// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  PurchaseOrderService,
  SupplierPurchaseOrderDetail,
} from "../../../../classes/purchase-order-service";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const GET = withAuthApi<
  { id: string },
  unknown,
  ResponseType<SupplierPurchaseOrderDetail>
>(async ({ db, req, userAuth }) => {
  const pathname = req.nextUrl.pathname.split("/");
  const purchaseOrderId = pathname[pathname.indexOf("detail") + 1];

  if (!purchaseOrderId) {
    return NextResponse.json(
      { success: false, error: "Purchase order ID not provided" },
      { status: 400 }
    );
  }

  const result = await db.tx(async (trx) => {
    const purchaseOrderService = new PurchaseOrderService(trx, userAuth.admin!);
    return await purchaseOrderService.getPurchaseOrderDetail(purchaseOrderId);
  });

  if (result) {
    return NextResponse.json({ success: true, result }, { status: 200 });
  } else {
    return NextResponse.json(
      { success: false, error: "Purchase order not found" },
      { status: 404 }
    );
  }
});
