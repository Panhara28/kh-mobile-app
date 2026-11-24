// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_product_images } from "../../../../generated/tables";
import { Formatter } from "../../../formatter";
import { Logger } from "../../../logger";
import { ProductImage } from "../../../../repository/product-image-repository";
import type { Db } from "../../../../db/db";
import { NextResponse } from "../../../../next-compat/server";
import { v4 } from "uuid";

interface ProductInput {
  url: string;
  imageOrder: number;
  productVariantId?: string | undefined;
}

export async function createProductImage(
  db: Db,
  input: ProductInput[],
  productId: string,
  logger: Logger
) {
  const result: ProductImage[] = [];
  const now = Formatter.getNowDateTime();

  if (!productId) {
    return NextResponse.json(
      { success: false, error: "Missing product ID" },
      { status: 400 }
    );
  }

  await db.table<table_product_images>("product_images").insert(
    input.map((i) => {
      const id = v4();
      const input = {
        id,
        productId,
        url: i.url,
        imageOrder: i.imageOrder,
        createdAt: now,
        updatedAt: null,
      };
      result.push(input);

      logger.serverLog("product_images:create", {
        key: id,
        action: "create",
        table_name: "product_images",
        content: input,
      });

      return {
        id,
        product_id: productId,
        image_url: i.url,
        image_order: i.imageOrder,
        created_at: now,
      };
    })
  );

  return NextResponse.json(
    {
      success: true,
      result,
    },
    { status: 200 }
  );
}
