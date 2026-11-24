// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_pricing_template } from "../../../generated/tables";
import { Formatter } from "../../../lib/formatter";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const deletePricingTemplate = withAuthApi<
  { id: string },
  unknown,
  ResponseType<string>
>(async ({ db, body, logger }) => {
  const data = {
    deleted_at: Formatter.getNowDateTime(),
  };

  await db.update("pricing_template", { template_id: (body as { id: string }).id }, data);

  logger.serverLog("pricing_template:DELETE", {
    action: "delete",
    table_name: "pricing_template",
    key: String((body as { id: string }).id),
    content: data,
  });

  return NextResponse.json(
    {
      success: true,
      result: "Pricing template deleted successfully",
    },
    { status: 200 }
  );
});
