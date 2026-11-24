// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../../formatter";
import { Logger } from "../../logger";
import type { Db } from "../../../db/db";
import { NextResponse } from "../../../next-compat/server";

export async function deleteProduct(
  db: Db,
  params: { id: string } | undefined,
  logger: Logger
) {
  if (!params?.id) {
    return NextResponse.json(
      { success: false, error: "Missing product ID" },
      { status: 400 }
    );
  }
  const now = Formatter.getNowDateTime();
  await db.update("product", { id: params.id }, {
    deleted_at: now,
  });
  logger.serverLog("product:delete", {
    action: "delete",
    table_name: "product",
    key: params.id,
    content: params,
  });
  return NextResponse.json(
    { success: true, id: params.id, result: true },
    { status: 200 }
  );
}
