// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../../lib/formatter";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { NextResponse } from "../../next-compat/server";

export const deleteTable = withAuthApi<{ id: string }>(
  async ({ db, body, userAuth }) => {
    const { id } = body as { id: string };
    await db
      .table("restaurant_tables")
      .update({
        deleted_at: Formatter.getNowDateTime(),
        deleted_by: userAuth.admin!.id,
      })
      .where({ id });

    return NextResponse.json({ success: true, result: true }, { status: 200 });
  }
);
