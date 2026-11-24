// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_product_images } from "../generated/tables";
import BaseRepository from "./base-repository";
import { Formatter } from "../lib/formatter";

export interface ProductImage {
  id: string | undefined;
  productId: string;
  url: string;
  productVariantId?: string | null;
  imageOrder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export default class ProductImageRepository extends BaseRepository<table_product_images> {
  protected tableName: string = "product_images";
  protected idColumnName = "id";

  async findByProductIds(
    productIds: readonly string[],
  ): Promise<table_product_images[]> {
    return this.tx.rows<table_product_images>(this.tableName, { product_id: { in: [...productIds] } });
  }

  async findByVariantIds(
    variantIds: readonly string[],
  ): Promise<table_product_images[]> {
    return this.tx.rows<table_product_images>(this.tableName, { product_variant_id: { in: [...variantIds] } });
  }

  static async map(
    row: table_product_images,
    hostname?: string,
  ): Promise<ProductImage> {
    return {
      id: row.id,
      productId: row.product_id,
      url: await Formatter.displayImage(row.image_url, hostname),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      imageOrder: row.image_order,
      productVariantId: row.product_variant_id,
    };
  }
}
