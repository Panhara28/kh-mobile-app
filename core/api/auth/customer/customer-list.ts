// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Customer, CustomerService } from "../../../classes/customer";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const getCustomerList = withAuthApi<
  unknown,
  unknown,
  ResponseType<{ data: Customer[]; total: number }>,
  {
    limit: number;
    offset: number;
    phone?: string;
    type?: "general" | "delivery";
  }
>(async ({ db, userAuth, searchParams }) => {
  const params = searchParams;
  const limit = params?.limit || 30;
  const offset = params?.offset || 0;
  const phone = params?.phone || undefined;
  const type = params?.type || undefined;

  const customerService = new CustomerService(db);

  const result = await customerService.getCustomerList({
    limit,
    offset,
    warehouseId: userAuth.admin?.currentWarehouseId || "",
    phone,
    type,
  });

  return NextResponse.json(
    { success: true, result, error: "" },
    { status: 200 },
  );
});
