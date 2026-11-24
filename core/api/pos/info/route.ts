// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_customer, table_warehouse_slot } from "../../../generated/tables";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export interface InfoResponse {
  posSlotId: string;
  posCustomerId: string;
}

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<InfoResponse>,
  { warehouse: string }
>(
  async ({ db, searchParams }) => {
    if (!searchParams?.warehouse) {
      return NextResponse.json(
        { success: false, error: "Warehouse is required" },
        { status: 400 }
      );
    }

    const { warehouse } = searchParams;
    const slot: table_warehouse_slot = await db.row("warehouse_slot", { AND: [{ warehouse_id: warehouse }, { pos_slot: 1 }] });
    const customer: table_customer = await db.row("customer", { AND: [{ pos_warehouse_id: warehouse }, { customer_name: "Walk In" }] });
    if (!slot || !customer) {
      return NextResponse.json(
        { success: false, error: "POS Slot or Customer not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        success: true,
        result: {
          posSlotId: slot.id!,
          posCustomerId: customer.id!,
        },
      },
      { status: 200 }
    );
  },
  ["ADMIN", "CUSTOMER"]
);
