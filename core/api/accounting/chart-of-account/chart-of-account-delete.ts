// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { Formatter } from "../../../lib/formatter";

export const deleteChartOfAccount = withAuthApi<
  { id: string },
  unknown,
  ResponseType<unknown>
>(async ({ db, body, userAuth }) => {
  await db.update("chart_of_account", { id: (body as { id: string }).id }, {
      deleted_at: Formatter.getNowDateTime(),
      deleted_by: userAuth.admin?.id,
    });

  return NextResponse.json(
    {
      success: true,
      message: "Chart of account deleted successfully",
    },
    { status: 200 },
  );
});
