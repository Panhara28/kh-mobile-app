// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_replenishment_items {
  replenish_items_id?: string;
  replenish_id: string | null;
  product_variant_id: string | null;
  sent_qty: number | null;
  cost: string | null;
  received_qty: number | null;
  status: 'receiving' | 'received' | 'cancelled';
  receiving_at: string | null;
  receiving_by: string | null;
  received_at: string | null;
  received_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}