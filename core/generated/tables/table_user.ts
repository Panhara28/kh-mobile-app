// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface table_user {
  created_at: string | null;
  created_by: string | null;
  fullname: string | null;
  id?: string;
  is_deleted?: number | null;
  is_dev?: number;
  is_system_admin?: number;
  password: string;
  phone_number: string;
  profile: string | null;
  role_id: string | null;
  token: string;
  username: string;
  warehouse_id: string | null;
}