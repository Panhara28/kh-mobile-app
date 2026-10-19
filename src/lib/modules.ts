import type { StaffUser } from './api';
import { can } from './line';

export type ModuleGroup = 'daily' | 'reports' | 'stock' | 'setup';

/** A part of the app the staff member can open from the More screen. */
export interface AppModule {
  id: string;
  /** Expo Router path. */
  route: string;
  /** The kh-pos permission resource that gates it (the same one the web menu uses); null for anyone. */
  resource: string | null;
  icon: string;
  /** Translation key of its name. */
  titleKey: string;
  group: ModuleGroup;
}

/**
 * Every module of the app, in the order shown. Add a module here when its screen exists; the More
 * screen shows it to the staff whose role may read its resource, like the kh-pos web menu does
 * (src/lib/menu-routes.ts).
 */
export const MODULES: AppModule[] = [
  { id: 'tables', route: '/tables', resource: 'restaurant', icon: '🍽', titleKey: 'more.tables', group: 'daily' },
  { id: 'shift', route: '/shift', resource: 'shift', icon: '🕒', titleKey: 'more.shift', group: 'daily' },
];

export function visibleModules(user: StaffUser | null | undefined): AppModule[] {
  return MODULES.filter((m) => m.resource === null || can(user, m.resource, 'read'));
}

export const GROUP_ORDER: ModuleGroup[] = ['daily', 'reports', 'stock', 'setup'];
