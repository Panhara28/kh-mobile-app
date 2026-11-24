// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { getTableMode, refreshTableStatus } from "../../../classes/table-mode";
import {
  ForbiddenError,
  isCustomerRequest,
  requireCustomerTable,
} from "../../../lib/server-functions/customer-scope";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["available", "order_taken", "cleaning"]),
});

export const updateTableStatus = withAuthApi<
  { id: string },
  { status: string }
>(
  async ({ db, params, body, userAuth }) => {
    const { status } = statusSchema.parse(body);

    // A diner can only mark the table they scanned as taken when they start ordering.
    if (isCustomerRequest(userAuth)) {
      if (params?.id !== requireCustomerTable(userAuth)) {
        throw new ForbiddenError("This is not your table");
      }
      if (status !== "order_taken") {
        throw new ForbiddenError("Only staff can change the table status");
      }
    }

    if (status !== "order_taken" && (await getTableMode(db, userAuth.admin?.currentWarehouseId)).mode === "TAG") {
      // stays taken while another group sits there
      await refreshTableStatus(db, params!.id, status);
    } else {
      await db.update("restaurant_tables", { id: params?.id }, { status });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  },
  ["ADMIN", "CUSTOMER"]
);
