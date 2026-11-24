// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_customer_token {
  created_at: number;
  customer_id: string;
  device_id: string;
  expires_at: number;
  id?: number;
  is_revoked?: number;
  lat: string | null;
  lng: string | null;
  metadata: unknown | null;
  platform?: "ios" | "android" | "web";
  table_id?: string | null;
  token: string;
  token_type?: "walk-in" | "online";
}
