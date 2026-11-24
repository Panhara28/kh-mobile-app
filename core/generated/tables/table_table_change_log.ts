// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_table_change_log {
  id: string;
  request_id: string;
  warehouse_id: string;
  order_id: string;
  invoice_no: number | null;
  tag_no: string | null;
  from_table_id: string;
  from_table_name: string;
  to_table_id: string;
  to_table_name: string;
  changed_by: string;
  changed_by_name: string;
  changed_at: string;
  reason: string | null;
}
