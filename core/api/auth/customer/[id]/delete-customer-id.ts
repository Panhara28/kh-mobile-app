// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { CustomerService } from "../../../../classes/customer";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const deleteCustomerId = withAuthApi<
  { id: string },
  unknown,
  ResponseType<unknown>
>(async ({ db, params }) => {
  const customerService = new CustomerService(db);

  const res = customerService.deleteCustomer(params?.id || "");

  return NextResponse.json(
    { success: true, result: res, error: "" },
    { status: 200 },
  );
});
