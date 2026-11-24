// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_discount {
  discount_id: string;
  title: string;
  description: string;
  discount_type?: 'AMOUNT' | 'PERCENTAGE';
  value?: string;
  deleted_at: string | null;
  created_at: string | null;
  update_at: string | null;
  created_by: string;
  updated_by: string;
  warehouse_id: string | null;
  auto_id: number;
}