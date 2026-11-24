// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withDatabaseApi from "../../../lib/server-functions/with-database-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const GET = withDatabaseApi<
  unknown,
  unknown,
  ResponseType<boolean>,
  unknown
>(async ({ db }) => {
  const hasUser = await db.row("user", {});

  return NextResponse.json(
    {
      success: true,
      result: !!hasUser,
    },
    { status: 200 }
  );
});
