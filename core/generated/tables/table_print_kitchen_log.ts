// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface table_print_kitchen_log {
  id?: number;
  order_id: string;
  order_detail_id: string;
  item_price: string;
  printed_at?: number;
  content: any | null;
  kind?: "NEW_ORDER" | "TABLE_CHANGE" | "ITEM_CANCEL";
  printer_info: any | null;
}
