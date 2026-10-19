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
  { id: 'orders', route: '/orders', resource: 'order', icon: '🧾', titleKey: 'more.orders', group: 'daily' },
  { id: 'shift', route: '/shift', resource: 'shift', icon: '🕒', titleKey: 'more.shift', group: 'daily' },
  { id: 'report-dashboard', route: '/report/dashboard', resource: 'dashboard', icon: '📊', titleKey: 'reports.dashboard', group: 'reports' },
  { id: 'report-end-of-day', route: '/report/end-of-day', resource: 'end-of-day', icon: '🌙', titleKey: 'reports.end-of-day', group: 'reports' },
  { id: 'report-sale-report', route: '/report/sale-report', resource: 'sale-report', icon: '📈', titleKey: 'reports.sale-report', group: 'reports' },
  { id: 'report-sale-breakdown', route: '/report/sale-breakdown', resource: 'sale-breakdown', icon: '🗂', titleKey: 'reports.sale-breakdown', group: 'reports' },
  { id: 'report-sale-item-report', route: '/report/sale-item-report', resource: 'sale-item-report', icon: '🍛', titleKey: 'reports.sale-item-report', group: 'reports' },
  { id: 'report-void-order', route: '/report/void-order', resource: 'void-order', icon: '🚫', titleKey: 'reports.void-order', group: 'reports' },
  { id: 'report-guest-number', route: '/report/guest-number', resource: 'guest-number', icon: '🧍', titleKey: 'reports.guest-number', group: 'reports' },
  { id: 'report-stock-report', route: '/report/stock-report', resource: 'stock-report', icon: '📦', titleKey: 'reports.stock-report', group: 'reports' },
  { id: 'report-expiry', route: '/report/expiry', resource: 'expiry', icon: '⏳', titleKey: 'reports.expiry', group: 'reports' },
  { id: 'products', route: '/products', resource: 'product', icon: '🍜', titleKey: 'more.products', group: 'setup' },
  { id: 'account', route: '/account', resource: null, icon: '👤', titleKey: 'more.account', group: 'daily' },
  { id: 'users', route: '/users', resource: 'users', icon: '👥', titleKey: 'more.users', group: 'setup' },
  { id: 'branches', route: '/branches', resource: 'warehouse', icon: '🏪', titleKey: 'more.branches', group: 'setup' },
  { id: 'settings', route: '/settings', resource: 'setting', icon: '⚙️', titleKey: 'more.settings', group: 'setup' },
  { id: 'categories', route: '/categories', resource: 'category', icon: '🗂', titleKey: 'more.categories', group: 'setup' },
  { id: 'modifiers', route: '/modifiers', resource: 'modifier', icon: '➕', titleKey: 'more.modifiers', group: 'setup' },
  { id: 'discounts', route: '/discounts', resource: 'discount', icon: '🏷', titleKey: 'more.discounts', group: 'setup' },
  { id: 'payment-methods', route: '/payment-methods', resource: 'payment', icon: '💳', titleKey: 'more.paymentMethods', group: 'setup' },
  { id: 'stock-movements', route: '/stock-movements', resource: 'transaction', icon: '🔁', titleKey: 'more.stockMovements', group: 'stock' },
  { id: 'returns', route: '/returns', resource: 'order', icon: '↩️', titleKey: 'more.returns', group: 'stock' },
  { id: 'backlog', route: '/backlog', resource: 'backlog', icon: '⏱', titleKey: 'more.backlog', group: 'stock' },
  { id: 'suppliers', route: '/suppliers', resource: 'supplier', icon: '🚚', titleKey: 'more.suppliers', group: 'stock' },
  { id: 'table-setup', route: '/table-setup', resource: 'table', icon: '🪑', titleKey: 'more.tableSetup', group: 'setup' },
];

export function visibleModules(user: StaffUser | null | undefined): AppModule[] {
  return MODULES.filter((m) => m.resource === null || can(user, m.resource, 'read'));
}

export const GROUP_ORDER: ModuleGroup[] = ['daily', 'reports', 'stock', 'setup'];
