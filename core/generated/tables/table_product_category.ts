// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_product_category {
  id?: string;
  title: string;
  description: string | null;
  parent_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  delete_date: string | null;
  image_url: string | null;
  sort_order?: number;
  exclude_fee_delivery?: number;
  mark_extra_fee?: string;
}