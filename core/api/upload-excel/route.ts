// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ExcelRow, UploadFromExcel } from "../../classes/upload-from-excel";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

export const GET = withAuthApi(async ({ db, userAuth }) => {
  const excelData = await new UploadFromExcel(
    db,
    userAuth.admin!,
    "product_list.xlsx"
  ).uploadProducts();
  // Process the excelData as needed
  console.log(excelData);
  return NextResponse.json({ success: true, data: excelData });
});


export const POST = withAuthApi<unknown, {data: ExcelRow[]}, ResponseType<unknown>>(async ({body, userAuth, db}) => {

  const excelData = await new UploadFromExcel(
    db,
    userAuth.admin!,
    "product_list.xlsx"
  ).uploadProducts(body?.data);

  return NextResponse.json({ success: true, data: excelData });
})