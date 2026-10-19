/** Roles and what each may do, like the kh-pos web Accessibility page. kh-pos stores permissions as JSON: {"order":"create,read"}. */

export type Action = 'create' | 'read' | 'update' | 'delete';
export const ACTIONS: Action[] = ['read', 'create', 'update', 'delete'];

/** Every resource kh-pos knows about (src/lib/permissions.ts). */
export const RESOURCES = [
  'users', 'role', 'warehouse', 'slot', 'setting', 'accessibility',
  'dashboard', 'board-member-dashboard', 'board-member-sale-report',
  'restaurant', 'table', 'order', 'order-preparation', 'pos', 'shift', 'backlog',
  'product', 'product-group', 'category', 'modifier', 'discount', 'payment', 'pricing-template', 'composition', 'supplier',
  'purchase-order', 'replenishment', 'transfer', 'stock-counting', 'transaction', 'production', 'expiry',
  'sale-report', 'sale-breakdown', 'sale-item-report', 'void-order', 'guest-number', 'stock-report', 'end-of-day',
  'cinema-showtime-sale', 'showtime', 'hall-seat', 'ticket', 'digital', 'settlement',
] as const;

export type Permissions = Record<string, Action[]>;

export interface RoleRow {
  id: string;
  role: string;
  permissions?: string | null;
}

const isAction = (a: string): a is Action => (ACTIONS as string[]).includes(a);

/** Reads the stored permissions; anything unreadable gives none. */
export function parsePermissions(raw: string | null | undefined): Permissions {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Permissions = {};
    for (const [resource, value] of Object.entries(obj)) {
      const list = (Array.isArray(value) ? value.map(String) : String(value).split(',')).map((s) => s.trim()).filter(isAction);
      if (list.length) out[resource] = ACTIONS.filter((a) => list.includes(a));
    }
    return out;
  } catch {
    return {};
  }
}

/** What kh-pos stores: resources without any action are left out, actions in a fixed order. */
export function serializePermissions(p: Permissions): string {
  const out: Record<string, string> = {};
  for (const resource of Object.keys(p)) {
    const list = ACTIONS.filter((a) => p[resource]?.includes(a));
    if (list.length) out[resource] = list.join(',');
  }
  return JSON.stringify(out);
}

/** Turns one action on or off for a resource; "read" is dropped last, so removing it clears the rest. */
export function toggleAction(p: Permissions, resource: string, action: Action, on: boolean): Permissions {
  const current = p[resource] ?? [];
  let next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action);
  if (on && action !== 'read') next = [...new Set([...next, 'read' as Action])];
  if (!on && action === 'read') next = [];
  return { ...p, [resource]: ACTIONS.filter((a) => next.includes(a)) };
}

export function setAll(p: Permissions, resource: string, on: boolean): Permissions {
  return { ...p, [resource]: on ? [...ACTIONS] : [] };
}

export const countGranted = (p: Permissions) => Object.values(p).filter((l) => l.length > 0).length;

export function validateRole(name: string, permissions: Permissions): 'name' | 'long' | 'none' | null {
  if (!name.trim()) return 'name';
  if (name.trim().length > 50) return 'long';
  if (countGranted(permissions) === 0) return 'none';
  return null;
}

export const roleBody = (name: string, permissions: Permissions, id?: string) => ({ ...(id ? { id } : {}), role: name.trim(), permissions: serializePermissions(permissions) });
