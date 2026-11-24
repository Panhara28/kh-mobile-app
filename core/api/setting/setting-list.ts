// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_setting } from "../../generated/tables";
import { SETUP_OPTION } from "../../classes/setup";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const settingList = withAuthApi<
  unknown,
  unknown,
  ResponseType<table_setting[]>,
  { warehouseId?: string }
>(
  async ({ userAuth, db, searchParams }) => {
    let warehouseId = searchParams?.warehouseId;

    if (userAuth.admin) {
      warehouseId = userAuth.admin.currentWarehouseId;
    }

    if (userAuth.customer) {
      warehouseId = userAuth.customer?.warehouseId;
    }

    // Signed-out pages (login) have no warehouse: return only the global settings.
    const query = db.table("setting").where({ warehouse: null });
    if (warehouseId) query.orWhere("warehouse", warehouseId);
    const list: table_setting[] = await query;

    // SETUP is internal first-time-setup progress (see classes/setup.ts), not an editable setting
    const result = list.filter((s) => s.option !== SETUP_OPTION);

    return NextResponse.json(
      { success: true, result, error: "" },
      { status: 200 },
    );
  },
  ["ADMIN", "CUSTOMER", "PUBLIC"],
);
