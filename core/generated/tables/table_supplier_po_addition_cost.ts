// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_supplier_po_addition_cost {
  id: string;
  supplier_po_id: string | null;
  name: string | null;
  cost: string | null;
  created_at: string | null;
  updated_at: string | null;
  status: 'pending' | 'received' | 'cancelled';
}