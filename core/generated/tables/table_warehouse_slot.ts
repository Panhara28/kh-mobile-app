// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_warehouse_slot {
  id?: string;
  slot_name: string;
  warehouse_id: string;
  slot_capacity: number | null;
  slot_status: 'ACTIVE' | 'INACTIVE';
  created_at: string | null;
  updated_at: string | null;
  is_deleted?: number | null;
  pos_slot?: number | null;
  created_by: string | null;
  updated_by: string | null;
  for_replenishment?: number | null;
}