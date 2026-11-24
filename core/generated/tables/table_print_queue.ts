// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface table_print_queue {
  id?: number;
  created_at: string;
  created_by: string;
  content: any;
  kind?: "NEW_ORDER" | "TABLE_CHANGE" | "ITEM_CANCEL";
  printer_info: any;
  warehouse_id: string;
  order_id: string | null;
  order_detail_id: string | null;
  item_price: string | null;
}
