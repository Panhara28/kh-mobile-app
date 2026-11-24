// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  ExpiryFilters,
  productExpiry,
  ProductExpiryReport,
} from "../../../classes/reports/product-expiry";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<ProductExpiryReport>,
  ExpiryFilters
>(async ({ userAuth, db }) => {
  const report = new productExpiry(db, userAuth.admin!);
  const result = await report.getProductExpiry();
  return NextResponse.json({
    success: true,
    result: result,
  });
});
