// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_payment_method } from "../../../generated/tables";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { createMethod } from "./method-create";
import { updateMethod } from "./method-update";
import { deleteMethod } from "./method_delete";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<table_payment_method[]>
>(async ({ db }) => {
  const items: table_payment_method[] = await db.rows("payment_method", { deleted_at: null });
  return NextResponse.json({ success: true, result: items }, { status: 200 });
});

export const POST = createMethod;
export const PUT = updateMethod;
export const DELETE = deleteMethod;
