/**
 * Settings → General → Accessibility, like the kh-pos web Accessibility page: every role with the resources it
 * may use and, for each, which of Create / Update / Delete it is allowed (Read is always on). kh-pos stores
 * a role's permissions as JSON text: {"order":"create,update,delete,read"}.
 */

export type Action = 'create' | 'update' | 'delete' | 'read';
/** The order the web shows and lists the switches in. */
export const ACTIONS: Action[] = ['create', 'update', 'delete', 'read'];

/** Every resource a role can be given (kh-pos `DEFAULT_ROLE_PERMISSIONS`). */
export const RESOURCES = [
  'users', 'warehouse', 'dashboard', 'product', 'category', 'order', 'supplier', 'setting', 'role', 'shift', 'transfer',
  'replenishment', 'purchase-order', 'stock-counting', 'slot', 'discount', 'payment', 'pricing-template', 'composition',
  'accessibility', 'modifier', 'production', 'transaction', 'backlog', 'expiry', 'restaurant', 'order-preparation', 'table',
  'sale-breakdown', 'pos', 'sale-report', 'void-order', 'guest-number', 'stock-report', 'end-of-day', 'cinema-showtime-sale',
  'sale-item-report', 'board-member-dashboard', 'showtime', 'hall-seat', 'ticket', 'digital', 'settlement', 'product-group',
  'board-member-sale-report',
] as const;

export type Permissions = Record<string, Action[]>;

export interface RoleRow {
  id: string;
  role: string;
  /** The server sends the stored JSON, as text or already read. */
  permissions?: string | Record<string, string | string[]> | null;
}

export interface Role {
  id: string;
  role: string;
  permissions: Permissions;
}

/** Reads a role's permissions; unreadable or missing means none. */
export function parsePermissions(raw: RoleRow['permissions']): Permissions {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object') return {};
  const out: Permissions = {};
  for (const [resource, value] of Object.entries(obj as Record<string, unknown>)) {
    const list = Array.isArray(value) ? value.map(String) : String(value).split(',');
    out[resource] = list.map((a) => a.trim()) as Action[];
  }
  return out;
}

export const toRoles = (rows: RoleRow[]): Role[] => rows.map((r) => ({ id: r.id, role: r.role, permissions: parsePermissions(r.permissions) }));

/** What kh-pos stores: a resource with no action is left out. */
export function serializePermissions(p: Permissions): string {
  const out: Record<string, string> = {};
  for (const [resource, list] of Object.entries(p)) if (list.length > 0) out[resource] = list.join(',');
  return JSON.stringify(out);
}

/** Turns actions on or off for one resource (the web toggles one action at a time). */
export function togglePermission(p: Permissions, resource: string, actions: Action | Action[], enabled: boolean): Permissions {
  const change = Array.isArray(actions) ? actions : [actions];
  let next = [...(p[resource] ?? [])];
  if (enabled) for (const a of change) if (!next.includes(a)) next.push(a);
  if (!enabled) next = next.filter((a) => !change.includes(a));
  return { ...p, [resource]: next };
}

export function removeResource(p: Permissions, resource: string): Permissions {
  const next = { ...p };
  delete next[resource];
  return next;
}

/** A resource just added starts with every action on. */
export function addResource(p: Permissions, resource: string): Permissions {
  return resource && !p[resource] ? { ...p, [resource]: [...ACTIONS] } : p;
}

/** Resources not yet on the role, A to Z. */
export const availableResources = (p: Permissions): string[] => [...RESOURCES].filter((r) => !p[r]).sort((a, b) => a.localeCompare(b));

/** "order-preparation" → "order preparation". */
export const resourceLabel = (resource: string) => resource.replace(/-/g, ' ');

/** Read is always shown on and can't be turned off. */
export const isEnabled = (list: Action[], action: Action) => action === 'read' || list.includes(action);

export const ROLE_NAME_MAX = 50;

/** The web's checks for a new role's name. */
export function validateRoleName(name: string): 'empty' | 'long' | null {
  if (!name.trim()) return 'empty';
  if (name.trim().length > ROLE_NAME_MAX) return 'long';
  return null;
}

export const createRoleBody = (name: string, p: Permissions) => ({ role: name.trim(), permissions: serializePermissions(p) });
export const updateRoleBody = (role: Role, p: Permissions) => ({ id: role.id, role: role.role, permissions: serializePermissions(p) });
