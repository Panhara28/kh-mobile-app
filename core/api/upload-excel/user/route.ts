// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { UploadFromExcel, UserExcelRow } from "../../../classes/upload-from-excel";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const POST = withAuthApi<
  unknown,
  { data: UserExcelRow[] },
  ResponseType<unknown>
>(async ({ body, userAuth, db }) => {
  const excelData = await new UploadFromExcel(
    db,
    userAuth.admin!,
    "user_list.xlsx",
  ).uploadUsers(body?.data ?? []);

  return NextResponse.json({ success: true, data: excelData });
});
