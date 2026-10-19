import { can } from '@/lib/line';
import type { StaffUser } from '@/lib/api';

export type HubKey = 'general' | 'users' | 'delivery' | 'payment';

export interface HubTile {
  key: HubKey;
  /** Resource the role needs "read" on, like the web dialog. */
  resource: string;
  /** Built on the phone yet. */
  available: boolean;
}

/**
 * The sections of the web Settings dialog this user may open: General and Users always (when the role
 * allows), Delivery only for a restaurant POS, Payment Method only on the main branch.
 */
export function hubTiles(user: StaffUser | null | undefined, systemType: string, isMainBranch: boolean): HubTile[] {
  const all: HubTile[] = [
    { key: 'general', resource: 'setting', available: true },
    { key: 'users', resource: 'users', available: false },
  ];
  if (systemType === 'RESTAURANT') all.push({ key: 'delivery', resource: 'delivery', available: false });
  if (isMainBranch) all.push({ key: 'payment', resource: 'payment', available: false });
  return all.filter((t) => can(user, t.resource, 'read'));
}
