// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_showtime {
  showtime_id: string;
  hall_id: string;
  movie_id: string;
  show_date: string;
  start_time: string;
  end_time: string;
  pricing_template_id: string | null;
  status?: 'scheduled' | 'selling' | 'sold_out' | 'started' | 'ended' | 'cancelled';
  available_seats?: number;
  total_seats?: number;
  base_price: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  settlement_id: string | null;
  booking_id: string | null;
}