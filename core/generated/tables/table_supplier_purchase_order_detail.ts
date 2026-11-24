// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_supplier_purchase_order_detail {
  created_at: string | null;
  id?: string;
  product_variant_id: string;
  purchased_cost: string;
  quantity: number;
  received_qty?: number | null;
  status?: "pending" | "received" | "cancelled";
  supplier_purchase_order_id: string;
  updated_at: string | null;
}
