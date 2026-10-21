/** Staff accounts, branches (warehouses) and stock slots: the shapes kh-pos sends and the bodies it wants back. */

const text = (v: unknown) => (typeof v === 'string' ? v : '');

// ---- users ----

export interface UserRow {
  id: string;
  username: string;
  fullname?: string | null;
  phoneNumber?: string | null;
  profile?: string | null;
  roleId?: string | null;
  currentWarehouseId?: string | null;
  role?: { role?: string } | null;
  warehouse?: { name?: string } | null;
}

export interface UserForm {
  /** Empty for a new account. */
  id: string;
  username: string;
  password: string;
  fullname: string;
  phoneNumber: string;
  roleId: string;
  warehouseId: string;
  [key: string]: unknown;
}

export const emptyUser = (warehouseId = ''): UserForm => ({ id: '', username: '', password: '', fullname: '', phoneNumber: '', roleId: '', warehouseId });

export const userForm = (u: UserRow): UserForm => ({
  id: u.id,
  username: u.username,
  password: '',
  fullname: text(u.fullname),
  phoneNumber: text(u.phoneNumber),
  roleId: text(u.roleId),
  warehouseId: text(u.currentWarehouseId),
});

/** What a new account needs, and what an edit needs (the username and password are changed elsewhere). */
export function validateUser(f: UserForm, creating: boolean): string | null {
  if (creating && f.username.trim().length < 3) return 'username';
  if (creating && f.password.length < 4) return 'password';
  if (!f.fullname.trim()) return 'fullname';
  if (!f.roleId) return 'roleId';
  if (!f.warehouseId) return 'warehouseId';
  return null;
}

/**
 * kh-pos' user schema asks for every field; on update it only saves the name, phone, picture,
 * role and branch, so the username and password sent then are placeholders.
 */
export function userBody(f: UserForm, existing?: UserRow) {
  return {
    ...(existing ? { id: existing.id } : {}),
    username: existing?.username ?? f.username.trim(),
    password: existing ? '-' : f.password,
    phoneNumber: f.phoneNumber.trim(),
    fullname: f.fullname.trim(),
    profile: text(existing?.profile),
    roleId: f.roleId,
    warehouseId: f.warehouseId,
  };
}

export const validNewPassword = (p: string) => p.length >= 4;

// ---- branches ----

export interface BranchRow {
  id?: string;
  name: string;
  isMain: boolean;
  phoneNumber?: string | null;
  address?: string | null;
  ownerName?: string | null;
  image?: string | null;
  lat?: string | null;
  lng?: string | null;
  createdAt?: string | null;
  useMainBranchVisibility?: boolean | null;
}

export interface BranchForm {
  /** Empty for a new branch. */
  id: string;
  warehouseName: string;
  ownerName: string;
  phoneNumber: string;
  address: string;
  image: string;
  lat: string;
  lng: string;
  userName: string;
  password: string;
  useMainBranchVisibility: boolean;
  [key: string]: unknown;
}

export const emptyBranch = (): BranchForm => ({ id: '', warehouseName: '', ownerName: '', phoneNumber: '', address: '', image: '', lat: '', lng: '', userName: '', password: '', useMainBranchVisibility: false });
export const branchForm = (b: BranchRow): BranchForm => ({
  id: b.id ?? '',
  warehouseName: b.name,
  ownerName: text(b.ownerName),
  phoneNumber: text(b.phoneNumber),
  address: text(b.address),
  image: text(b.image),
  lat: text(b.lat),
  lng: text(b.lng),
  userName: '',
  password: '',
  useMainBranchVisibility: !!b.useMainBranchVisibility,
});

/** The web list shows the main branch as "Name (Main)". */
export const branchTitle = (b: Pick<BranchRow, 'name' | 'isMain'>) => (b.isMain ? `${b.name} (Main)` : b.name);

/** The same minimum lengths as kh-pos' schema: names 3 characters, the owner's login 4; coordinates, when given, are numbers. */
export function validateBranch(f: BranchForm, creating: boolean): string | null {
  if (f.warehouseName.trim().length < 3) return 'warehouseName';
  if (f.ownerName.trim().length < 3) return 'ownerName';
  if (f.lat.trim() && !Number.isFinite(Number(f.lat))) return 'lat';
  if (f.lng.trim() && !Number.isFinite(Number(f.lng))) return 'lng';
  if (creating && f.userName.trim().length < 4) return 'userName';
  if (creating && f.password.trim().length < 4) return 'password';
  return null;
}

/** The web sends every field; the owner's login only when creating. */
export function branchBody(f: BranchForm, existing?: BranchRow) {
  const base = {
    warehouseName: f.warehouseName.trim(),
    ownerName: f.ownerName.trim(),
    phoneNumber: f.phoneNumber.trim(),
    address: f.address.trim(),
    image: f.image,
    lat: f.lat.trim(),
    lng: f.lng.trim(),
    useMainBranchVisibility: f.useMainBranchVisibility,
  };
  return existing ? { id: existing.id!, ...base } : { ...base, userName: f.userName.trim(), password: f.password.trim() };
}

// ---- stock slots ----

export interface SlotRow {
  id: string;
  name: string;
  warehouseId: string;
  posSlot?: boolean | number;
  forReplenishment?: boolean | number;
  createdAt?: string | null;
}

export interface SlotForm {
  slotName: string;
  forReplenishment: boolean;
  [key: string]: unknown;
}

export const emptySlot = (): SlotForm => ({ slotName: '', forReplenishment: false });
export const slotForm = (s: SlotRow): SlotForm => ({ slotName: s.name, forReplenishment: !!s.forReplenishment });
export const slotBody = (f: SlotForm, warehouseId: string, existing?: SlotRow) => ({
  ...(existing ? { id: existing.id } : {}),
  warehouseId,
  slotName: f.slotName.trim(),
  forReplenishment: f.forReplenishment,
});

export const SLOT_PAGE = 30;

/** The web list shows the POS slot as "Name (POS)". */
export const slotTitle = (s: Pick<SlotRow, 'name' | 'posSlot'>) => (s.posSlot ? `${s.name} (POS)` : s.name);

/** The list query the web sends for a branch: paged, with an optional name search. */
export function slotQuery(warehouseId: string, search: string, offset: number, limit = SLOT_PAGE): string {
  const q = new URLSearchParams({ warehouse_id: warehouseId, limit: String(limit), offset: String(offset) });
  if (search.trim()) q.set('search_name', search.trim());
  return q.toString();
}
