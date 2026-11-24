// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { ProductService } from "../../../classes/product-service";
import { Formatter } from "../../formatter";
import { Logger } from "../../logger";
import {
  inputProductSchema,
  Product,
  ProductInput,
} from "../../types/product-type";
import type { Db } from "../../../db/db";
import { NextResponse } from "../../../next-compat/server";
import { UserInfo } from "../get-auth-from-token";

export async function createProduct(
  db: Db,
  body: ProductInput | undefined,
  logger: Logger,
  user: UserInfo
) {
  const input = inputProductSchema.parse(body);
  const now = Formatter.getNowDateTime();
  await db.tx(async (trx) => {
    const productService = new ProductService(trx, user);
    await productService.createProduct(input);
  });

  logger.serverLog("product:POST", {
    action: "create",
    table_name: "product",
    key: input.id,
    content: input,
  });

  return NextResponse.json(
    {
      success: true,
      result: {
        id: input.id,
        title: input.title || "",
        description: input.description || "",
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        isComposite: input.isComposite || false,
        useProduction: input.useProduction || false,
        trackStock: input.trackStock || false,
        isForSale: input.isForSale || false,
      } as unknown as Product,
    },
    { status: 200 }
  );
}
