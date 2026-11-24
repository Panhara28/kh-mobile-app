// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ProductGroupService } from "../../../../../classes/product-group";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";

export const assignWarehouseGroup = withAuthApi<
  { id: string },
  { warehouseIds: string[] },
  ResponseType<unknown>
>(async ({ db, params, body }) => {
  const groupId = params?.id;
  const warehouseIds = body?.warehouseIds || [];

  const productGroupService = new ProductGroupService(db);

  const result = await productGroupService.assignWarehouseToGroup(
    groupId || "",
    warehouseIds,
  );

  return NextResponse.json(
    {
      success: true,
      data: result,
    },
    {
      status: 200,
    },
  );
});
