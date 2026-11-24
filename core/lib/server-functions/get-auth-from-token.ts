// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Warehouse } from "../../dataloader/warehouse-loader";
import type { table_customer, table_user_role } from "../../generated/tables";
import type { Db } from "../../db/db";
import { Formatter } from "../formatter";

export interface UserAuth {
  admin: UserInfo | undefined;
  customer: CustomerInfo | undefined;
  /**
   * True when `admin` is the branch system admin attached to a walk-in customer request.
   * It only gives handlers context (branch, created_by); it never passes an ADMIN check.
   */
  actingAdmin?: boolean;
}

export interface CustomerInfo {
  id: string;
  name: string;
  phoneNumber: string;
  warehouseId: string;
  isWalkin: boolean;
  lat?: number;
  lng?: number;
  email?: string | null;
  photo?: string | null;
  emailKey?: string | null;
  /** Walk-in diners: the table they scanned. Their order access is limited to it. */
  tableId?: string | null;
}

export interface UserRoles {
  id: string;
  role: string; // ADMIN, MANAGER, USER...
  userId: string;
  roleId: string;
  createdAt: string;
  permissions: Record<string, unknown> | null;
}
export interface UserInfo {
  id: string;
  username: string;
  phoneNumber: string;
  token: string;
  role?: UserRoles;
  profile: string;
  fullname: string;
  roleId: string | null;
  warehouse?: Warehouse | null;
  currentWarehouseId?: string;
  isDev?: boolean;
}

/**
 * The user, their role and their branch in ONE query (the old code made three round trips per request:
 * user by token, then role, then branch). `user.token` is indexed (idx_user_token).
 */
const USER_WITH_ROLE_SQL = `
  SELECT u.id, u.username, u.phone_number, u.token, u.fullname, u.profile, u.role_id, u.warehouse_id, u.is_dev,
         r.id AS r_id, r.role AS r_role, r.created_at AS r_created_at, r.permissions AS r_permissions,
         w.id AS w_id, w.name AS w_name, w.is_main AS w_is_main, w.created_at AS w_created_at,
         w.updated_at AS w_updated_at, w.phone AS w_phone, w.address AS w_address, w.image AS w_image,
         w.use_main_branch_visibility AS w_use_main_branch_visibility
  FROM user u
  LEFT JOIN user_role r ON r.id = u.role_id
  LEFT JOIN warehouse w ON w.id = u.warehouse_id`;

type UserRow = {
  id: string;
  username: string;
  phone_number: string;
  token: string;
  fullname: string;
  profile: string;
  role_id: string | null;
  warehouse_id: string | null;
  is_dev: number;
  r_id: string | null;
  r_role: string | null;
  r_created_at: unknown;
  r_permissions: unknown;
  w_id: string | null;
  w_name: string | null;
  w_is_main: number | null;
  w_created_at: unknown;
  w_updated_at: unknown;
  w_phone: string | null;
  w_address: string | null;
  w_image: string | null;
  w_use_main_branch_visibility: number | null;
};

const ROW_SPEC = {
  r_created_at: "datetime",
  w_created_at: "datetime",
  w_updated_at: "datetime",
  r_permissions: "json",
} as const;

function mapWarehouse(x: UserRow): Warehouse | null {
  if (!x.w_id) return null;
  // Same shape as dataloader/warehouse-loader.ts
  return {
    id: x.w_id || "",
    name: x.w_name || "",
    isMain: Boolean(x.w_is_main) || false,
    createdAt: (x.w_created_at as string) || "",
    updatedAt: (x.w_updated_at as string) || "",
    phone: x.w_phone || undefined,
    address: x.w_address || undefined,
    image: x.w_image || undefined,
    useMainBranchVisibility: Boolean(x.w_use_main_branch_visibility) || false,
  } as Warehouse;
}

function mapUser(user: UserRow, token: string): UserInfo {
  return {
    id: user.id,
    username: user.username,
    phoneNumber: user.phone_number,
    token,
    fullname: user.fullname,
    profile: user.profile,
    roleId: user.role_id,
    currentWarehouseId: user.warehouse_id,
    warehouse: user.warehouse_id ? mapWarehouse(user) : null,
    role: mapUserRole(
      { id: user.r_id, role: user.r_role, created_at: user.r_created_at, permissions: user.r_permissions } as unknown as table_user_role,
      user.id || "",
    ),
    isDev: Boolean(user.is_dev),
  } as UserInfo;
}

export default async function getAuthFromToken(db: Db, token: string): Promise<UserInfo | null> {
  if (!token) return null;
  const user = await db.first<UserRow>(`${USER_WITH_ROLE_SQL} WHERE u.token = ? AND u.is_deleted = 0 LIMIT 1`, [token], ROW_SPEC);
  if (!user) return null;
  return mapUser(user, user.token);
}

/** The branch's system admin, used as context for walk-in customer requests. */
export async function getSystemAdmin(warehouseId: string, db: Db): Promise<UserInfo | null> {
  const user = await db.first<UserRow>(`${USER_WITH_ROLE_SQL} WHERE u.is_system_admin = 1 AND u.warehouse_id = ? LIMIT 1`, [warehouseId], ROW_SPEC);
  if (!user) return null;
  const info = mapUser(user, "");
  // Never carry the system admin's real login token into a customer request.
  info.token = "";
  delete info.isDev;
  return info;
}

export function mapUserRole(role: table_user_role, userId: string): UserRoles {
  return {
    id: role?.id || "",
    role: role?.role || "",
    userId: userId,
    roleId: role?.id || "",
    createdAt: role?.created_at || "",
    permissions: role?.permissions,
  } as UserRoles;
}

export async function getCustomerAuthFromToken(db: Db, token: string): Promise<CustomerInfo | null> {
  if (!token) return null;
  const now = Formatter.getNowDateTime();
  const customer = await db.first<
    table_customer & { lat: number; lng: number; token_type: string | null; table_id: string | null }
  >(
    `SELECT customer.*, customer_token.lat, customer_token.lng, customer_token.token_type, customer_token.table_id
     FROM customer INNER JOIN customer_token ON customer.id = customer_token.customer_id
     WHERE customer_token.token = ? AND customer_token.is_revoked = 0 AND customer.is_active = 1
       AND (customer_token.expires_at IS NULL OR customer_token.expires_at > ?)
     LIMIT 1`,
    [token, now],
    // mysql2 returned DECIMAL lat/lng as strings
    { lat: { kind: "decimal", scale: 7 }, lng: { kind: "decimal", scale: 7 } },
  );

  if (!customer) return null;
  // Walk-in tokens issued before tokens were bound to a table are no longer accepted:
  // the menu logs in again and gets a table-bound token.
  if (customer.token_type === "walk-in" && !customer.table_id) return null;

  return {
    id: customer.id,
    name: customer.customer_name,
    phoneNumber: customer.phone,
    warehouseId: customer.pos_warehouse_id,
    isWalkin: customer.customer_name === "Walk In",
    lat: customer.lat,
    lng: customer.lng,
    email: customer.email,
    photo: customer.photo,
    emailKey: customer.email_key,
    tableId: customer.table_id,
  } as CustomerInfo;
}
