// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_cinema_seat {
  created_at: string;
  deleted_at: string | null;
  group_id: string | null;
  hall_id: string;
  is_available?: number;
  row_label: string;
  seat_id: string;
  seat_number: number;
  seat_type?: 'standard' | 'vip' | 'couple' | 'wheelchair' | 'blocked';
  updated_at: string;
}