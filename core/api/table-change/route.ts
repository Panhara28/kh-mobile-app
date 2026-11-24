// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ChangeTableService, changeTableSchema, type ChangeTableInput, type ChangeTableResult, type TableChange } from "../../classes/change-table";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";
import { z } from "zod";

/** Moves an open order to another table. */
export const POST = withAuthApi<unknown, ChangeTableInput, ResponseType<ChangeTableResult>>(async ({ db, userAuth, body }) => {
  const input = changeTableSchema.parse(body);
  const result = await new ChangeTableService(db, userAuth.admin!).change(input);
  return NextResponse.json({ success: true, result }, { status: 200 });
});

/** The moves of one order, oldest first. */
export const GET = withAuthApi<unknown, unknown, ResponseType<TableChange[]>, { orderId: string }>(
  async ({ db, userAuth, searchParams }) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(searchParams);
    const result = await new ChangeTableService(db, userAuth.admin!).history(orderId);
    return NextResponse.json({ success: true, result }, { status: 200 });
  },
);
