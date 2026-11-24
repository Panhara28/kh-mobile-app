// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_seat_reservation {
  reservation_id: string;
  showtime_id: string;
  seat_id: string;
  code: string | null;
  order_detail_id: string | null;
  reservation_status?: 'pending' | 'confirmed' | 'admitted' | 'cancelled' | 'expired';
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  admitted_by: string | null;
  admitted_at: string | null;
  price?: string;
}