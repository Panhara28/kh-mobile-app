// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../lib/formatter";
import { generateId } from "../lib/generate-id";
import type { Db } from "../db/db";
import z from "zod";

export const ProductWarehouseVisibilitySchema = z.object({
  warehouseId: z.string(),
  productId: z.string(),
  productVariantId: z.string(),
  isVisible: z.boolean().default(true),
  isForSale: z.boolean().default(true),
});

export type ProductWarehouseVisibility = z.infer<
  typeof ProductWarehouseVisibilitySchema
>;

export class ProductWarehouseVisibilityService {
  constructor(protected knex: Db) {}

  async setProductWarehouseVisibility(input: ProductWarehouseVisibility[]) {
    const insertData = input.map((item) => ({
      warehouse_id: item.warehouseId,
      product_id: item.productId,
      product_variant_id: item.productVariantId,
      is_visible: item.isVisible,
      is_for_sale: item.isForSale,
      id: generateId(),
      created_at: Formatter.getNowDateTime(),
      updated_at: Formatter.getNowDateTime(),
    }));

    await this.knex
      .table("product_warehouse_visibility")
      .insert(insertData)
      .onConflict(["warehouse_id", "product_id", "product_variant_id"])
      .merge();

    return true;
  }

  async removeProductWarehouseVisibility(
    input: {
      warehouseId: string;
      productId: string;
      productVariantId: string;
    }[],
  ) {
    await this.knex.tx(async (trx) => {
      for (const item of input) {
        await trx.del("product_warehouse_visibility", { AND: [{ warehouse_id: item.warehouseId }, { product_id: item.productId }, { product_variant_id: item.productVariantId }] });
      }
    });

    return true;
  }

  async setForSaleProductWarehouseVisibility(
    productId: string,
    warehouseId: string,
    isForSale: boolean,
  ) {
    await this.knex.update("product_warehouse_visibility", { AND: [{ warehouse_id: warehouseId }, { product_id: productId }] }, {
        is_for_sale: isForSale,
        updated_at: Formatter.getNowDateTime(),
      });

    return true;
  }

  async setVisibilityProductWarehouseVisibility(
    productVariantId: string,
    warehouseId: string,
    isVisible: boolean,
  ) {
    await this.knex.update("product_warehouse_visibility", { AND: [{ warehouse_id: warehouseId }, { product_variant_id: productVariantId }] }, {
        is_visible: isVisible,
        updated_at: Formatter.getNowDateTime(),
      });

    return true;
  }

  /**
   * Set a sub-warehouse's own override of the popular/new/most-order menu
   * badges for a variant. `null` clears the override so the branch goes
   * back to inheriting the main warehouse's flag.
   */
  async setBadgesProductWarehouseVisibility(
    productVariantId: string,
    warehouseId: string,
    badges: {
      isPopular?: boolean | null;
      isNew?: boolean | null;
      isMostOrder?: boolean | null;
    },
  ) {
    const update: Record<string, boolean | null> = {};
    if (badges.isPopular !== undefined) update.is_popular = badges.isPopular;
    if (badges.isNew !== undefined) update.is_new = badges.isNew;
    if (badges.isMostOrder !== undefined)
      update.is_most_order = badges.isMostOrder;

    await this.knex.update("product_warehouse_visibility", { AND: [{ warehouse_id: warehouseId }, { product_variant_id: productVariantId }] }, {
        ...update,
        updated_at: Formatter.getNowDateTime(),
      });

    return true;
  }
}
