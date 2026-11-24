// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_product_category } from "../generated/tables";
import BaseRepository from "./base-repository";
import { inList } from "../db/db";

export interface ProductCategory {
  id: string | undefined;
  categoryId?: string | undefined;
  title: string;
  description: string | null;
  parentId: string | null;
  imageUrl?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  sortOrder?: number | undefined;
  excludeFeeDelivery?: boolean | undefined;
  markExtraFee?: number | undefined;
}

export default class ProductCategoryRepository extends BaseRepository<table_product_category> {
  protected tableName: string = "product_category";
  protected idColumnName = "id";

  async findByProductIds(
    productIds: readonly string[],
  ): Promise<(table_product_category & { product_id?: string })[]> {
    return this.tx.query(
      `SELECT product_category.*, product_categories.product_id FROM product_categories
       INNER JOIN product_category ON product_categories.category_id = product_category.id
       WHERE product_id IN (${inList(productIds)})`,
      [...productIds],
    );
  }

  static map(row: table_product_category): ProductCategory {
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      title: row.title,
      description: row.description,
      parentId: row.parent_id,
      imageUrl: row.image_url,
      excludeFeeDelivery: Boolean(row.exclude_fee_delivery),
      markExtraFee:
        row.mark_extra_fee !== null ? Number(row.mark_extra_fee) : undefined,
      sortOrder: row.sort_order !== null ? Number(row.sort_order) : undefined,
    };
  }
}
