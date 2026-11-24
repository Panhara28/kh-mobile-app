// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../../../lib/formatter";
import { generateId } from "../../../lib/generate-id";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { SchemaChartOfAccount, TypeSchemaChartOfAccount } from "./schema";

export const createChartOfAccount = withAuthApi<
  unknown,
  TypeSchemaChartOfAccount,
  ResponseType<{ id: string }>
>(async ({ db, body, userAuth }) => {
  const input = SchemaChartOfAccount.parse(body);
  const id = generateId();

  await db.insert("chart_of_account", {
    id,
    account_name: input.account_name,
    account_type: input.account_type,
    created_at: Formatter.getNowDateTime(),
    created_by: userAuth.admin?.id,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Chart of account created successfully",
      result: { id },
    },
    { status: 200 },
  );
});
