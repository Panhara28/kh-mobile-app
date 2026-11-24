// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_order_item_status {
  created_at: string;
  created_by: string;
  order_item_id: string;
  qty?: number;
  status: 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
}