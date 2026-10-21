/**
 * Settings → Users, like the kh-pos web User page: the staff of this branch, add / edit with a picture and a
 * role, bind the person to other branches, reset someone's password, delete.
 */

export interface UserRow {
  id: string;
  username: string;
  fullname?: string | null;
  phoneNumber?: string | null;
  profile?: string | null;
  roleId?: string | null;
  role?: { id?: string; role: string } | null;
  warehouse?: { id?: string; name: string } | null;
  currentWarehouseId?: string | null;
}

export interface RoleRef {
  id: string;
  role: string;
}

export interface UserForm {
  id: string;
  username: string;
  password: string;
  phoneNumber: string;
  fullname: string;
  profile: string;
  roleId: string;
  warehouseId: string;
  /** A user being added (the username and password are asked only then). */
  isNew: boolean;
  [key: string]: unknown;
}

/** The role the web pre-selects for a new user. */
export const WEB_DEFAULT_ROLE_ID = '3f975657-f2c2-11ef-b03a-5a2b7664f615';

/** A new user starts in this branch, with the web's default role when this server has it. */
export function emptyUser(id: string, warehouseId: string, roles: RoleRef[]): UserForm {
  return {
    id,
    username: '',
    password: '',
    phoneNumber: '',
    fullname: '',
    profile: '',
    roleId: roles.some((r) => r.id === WEB_DEFAULT_ROLE_ID) ? WEB_DEFAULT_ROLE_ID : '',
    warehouseId,
    isNew: true,
  };
}

export function userFormOf(u: UserRow): UserForm {
  return {
    id: u.id,
    username: u.username,
    password: '',
    phoneNumber: u.phoneNumber ?? '',
    fullname: u.fullname ?? '',
    profile: u.profile ?? '',
    roleId: u.roleId ?? '',
    warehouseId: u.currentWarehouseId ?? '',
    isNew: false,
  };
}

/** Typing "12345" becomes "012345", like the web box. */
export function normalizePhone(value: string): string {
  return /^[1-9]/.test(value) ? `0${value}` : value;
}

/** The web sends whatever is typed; the phone needs a username, password (new user only) and full name so no empty account is made. */
export function validateUser(f: UserForm): (keyof UserForm & string) | null {
  if (f.isNew && !f.username.trim()) return 'username';
  if (f.isNew && !f.password) return 'password';
  if (!f.fullname.trim()) return 'fullname';
  return null;
}

/** The body of POST /api/user (new, with an id made on the phone) and PUT /api/user (edit). */
export function userBody(f: UserForm) {
  return {
    id: f.id,
    username: f.username.trim(),
    password: f.password,
    phoneNumber: f.phoneNumber,
    fullname: f.fullname,
    profile: f.profile,
    roleId: f.roleId,
    warehouseId: f.warehouseId,
  };
}

export const roleLabel = (u: Pick<UserRow, 'role'>) => (u.role ? u.role.role : null);

/** You can't delete yourself. */
export const canDeleteUser = (rowId: string, myId: string | undefined) => rowId !== myId;

/** Only an owner can reset a password, and not their own (that is Change Password in the profile menu). */
export const canResetPassword = (myRole: string | undefined, rowId: string, myId: string | undefined) => String(myRole).toLowerCase() === 'owner' && rowId !== myId;

export type ResetProblem = 'newPassword' | 'confirmPassword';

/** The web's checks: a new password of 6 or more letters, typed twice. */
export function validateReset(newPassword: string, confirm: string): ResetProblem | null {
  if (!newPassword || newPassword.length < 6) return 'newPassword';
  if (!confirm || confirm !== newPassword) return 'confirmPassword';
  return null;
}

// ---------- bind users (the same person at other branches) ----------

export interface BindEntry {
  userId: string;
  warehouseId: string;
  group: number;
  isMain: boolean;
  isNew?: boolean;
}

interface BindApiItem {
  userId: string;
  group: number;
  isMain: boolean;
  user?: { warehouseId?: { id?: string } | null } | null;
}

/** The saved bindings, or just this user's own branch as the main one when there are none yet. */
export function initialBindEntries(list: BindApiItem[], group: number, userId: string, warehouseId: string): BindEntry[] {
  if (list.length > 0) return list.map((x) => ({ userId: x.userId, group: x.group, isMain: x.isMain, warehouseId: x.user?.warehouseId?.id ?? '' }));
  return [{ userId, warehouseId, group, isMain: true }];
}

/** Branches this person is not bound to yet. */
export const availableBranches = <B extends { id: string }>(branches: B[], entries: BindEntry[]) => branches.filter((b) => !entries.some((e) => e.warehouseId === b.id));

export const addBinding = (entries: BindEntry[], warehouseId: string, group: number): BindEntry[] => [...entries, { userId: '', warehouseId, group, isMain: false, isNew: true }];

/** The main branch stays; any other can be taken away. */
export const removeBinding = (entries: BindEntry[], warehouseId: string): BindEntry[] => entries.filter((e) => e.warehouseId !== warehouseId || e.isMain);

/** The whole list goes to kh-pos, which works out what was added and removed; the main entry is always included. */
export function bindBody(entries: BindEntry[], group: number, userId: string, warehouseId: string) {
  const list = entries.map((e) => ({ userId: e.userId, warehouseId: e.warehouseId, group, isMain: e.isMain, isNew: e.isNew }));
  if (!list.some((e) => e.isMain)) list.push({ userId, warehouseId, group, isMain: true, isNew: false });
  return list;
}
