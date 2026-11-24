// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const toggleProductCategorySchema = z.object({
  categoryIds: z.array(z.string()),
  status: z.enum(["enable", "disable"]),
});

type ToggleProductCategoryRequest = z.infer<typeof toggleProductCategorySchema>;

export const POST = withAuthApi<
  ToggleProductCategoryRequest,
  ResponseType<{ affectedProducts: number }>
>(async ({ db, body }) => {
  const toggleData = toggleProductCategorySchema.parse(body);
  const res = await db.tx(async (trx) => {
    const product_categories = await trx.rows("product_categories", { category_id: { in: [...toggleData.categoryIds] } });

    if (product_categories.length > 0) {
      await trx.update("product", { id: { in: [...product_categories.map((pc) => pc.product_id)] } }, {
          is_for_sale: toggleData.status === "enable" ? true : false,
        });

      return product_categories.length;
    }

    return 0;
  });

  return NextResponse.json(
    {
      success: true,
      message: `Products have been ${toggleData.status === "enable" ? "enabled" : "disabled"} successfully.`,
      result: { affectedProducts: res },
    } as ResponseType<{ affectedProducts: number }>,
    { status: 200 },
  );
});
