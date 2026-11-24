// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_payment_transaction {
  id: string;
  draft_id: number;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  bank_reference: string;
  created_at?: number | null;
  created_by: string;
}