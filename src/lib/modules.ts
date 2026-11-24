import type { StaffUser } from './api';
import { isModuleForStore, storeKind } from './business-type';
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
  /** Shown only when this branch setting is "1" (the web menu does the same for Accounting). */
  setting?: string;
}

/**
 * Every module of the app, in the order shown. Add a module here when its screen exists; the More
 * screen shows it to the staff whose role may read its resource, like the kh-pos web menu does
 * (src/lib/menu-routes.ts).
 */
export const MODULES: AppModule[] = [
  { id: 'tables', route: '/tables', resource: 'restaurant', icon: '🍽', titleKey: 'more.tables', group: 'daily' },
  { id: 'retail', route: '/retail', resource: 'pos', icon: '🛒', titleKey: 'more.retail', group: 'daily' },
  { id: 'orders', route: '/orders', resource: 'order', icon: '🧾', titleKey: 'more.orders', group: 'daily' },
  { id: 'stock-finding', route: '/stock-finding', resource: 'transfer', icon: '🔎', titleKey: 'more.stockFinding', group: 'daily' },
  { id: 'shift', route: '/shift', resource: 'shift', icon: '🕒', titleKey: 'more.shift', group: 'daily' },
  { id: 'board', route: '/board', resource: 'board-member-dashboard', icon: '🏛', titleKey: 'more.board', group: 'reports' },
  { id: 'report-dashboard', route: '/report/dashboard', resource: 'dashboard', icon: '📊', titleKey: 'reports.dashboard', group: 'reports' },
  { id: 'report-end-of-day', route: '/report/end-of-day', resource: 'end-of-day', icon: '🌙', titleKey: 'reports.end-of-day', group: 'reports' },
  { id: 'report-sale-report', route: '/report/sale-report', resource: 'sale-report', icon: '📈', titleKey: 'reports.sale-report', group: 'reports' },
  { id: 'report-sale-breakdown', route: '/report/sale-breakdown', resource: 'sale-breakdown', icon: '🗂', titleKey: 'reports.sale-breakdown', group: 'reports' },
  { id: 'report-sale-item-report', route: '/report/sale-item-report', resource: 'sale-item-report', icon: '🍛', titleKey: 'reports.sale-item-report', group: 'reports' },
  { id: 'report-void-order', route: '/report/void-order', resource: 'void-order', icon: '🚫', titleKey: 'reports.void-order', group: 'reports' },
  { id: 'report-guest-number', route: '/report/guest-number', resource: 'guest-number', icon: '🧍', titleKey: 'reports.guest-number', group: 'reports' },
  { id: 'report-stock-report', route: '/report/stock-report', resource: 'stock-report', icon: '📦', titleKey: 'reports.stock-report', group: 'reports' },
  { id: 'report-expiry', route: '/report/expiry', resource: 'expiry', icon: '⏳', titleKey: 'reports.expiry', group: 'reports' },
  { id: 'report-sale-product', route: '/report/sale-product', resource: 'sale-report', icon: '🏆', titleKey: 'reports.sale-product', group: 'reports' },
  { id: 'product-groups', route: '/product-groups', resource: 'product-group', icon: '🧺', titleKey: 'more.productGroups', group: 'setup' },
  { id: 'products', route: '/products', resource: 'product', icon: '🍜', titleKey: 'more.products', group: 'setup' },
  { id: 'account', route: '/account', resource: null, icon: '👤', titleKey: 'more.account', group: 'daily' },
  { id: 'branches', route: '/branches', resource: 'warehouse', icon: '🏪', titleKey: 'more.branches', group: 'setup' },
  { id: 'table-setup', route: '/table-setup', resource: 'table', icon: '🪑', titleKey: 'more.tableSetup', group: 'setup' },
  { id: 'table-layout', route: '/table-layout', resource: 'table', icon: '🗺', titleKey: 'more.tableLayout', group: 'setup' },
  { id: 'settings', route: '/settings', resource: 'setting', icon: '⚙️', titleKey: 'more.settings', group: 'setup' },
  { id: 'promotion-sets', route: '/promotion-sets', resource: 'discount', icon: '🎁', titleKey: 'more.promotionSets', group: 'setup' },
  { id: 'booking', route: '/booking', resource: 'accounting', icon: '💰', titleKey: 'more.booking', group: 'setup', setting: 'ACCOUNTING' },
  { id: 'chart-of-accounts', route: '/chart-of-accounts', resource: 'accounting', icon: '📒', titleKey: 'more.chartOfAccounts', group: 'setup', setting: 'ACCOUNTING' },
  { id: 'categories', route: '/categories', resource: 'category', icon: '🗂', titleKey: 'more.categories', group: 'setup' },
  { id: 'modifiers', route: '/modifiers', resource: 'modifier', icon: '➕', titleKey: 'more.modifiers', group: 'setup' },
  { id: 'discounts', route: '/discounts', resource: 'discount', icon: '🏷', titleKey: 'more.discounts', group: 'setup' },
  { id: 'stock-movements', route: '/stock-movements', resource: 'transaction', icon: '🔁', titleKey: 'more.stockMovements', group: 'stock' },
  { id: 'returns', route: '/returns', resource: 'return', icon: '↩️', titleKey: 'more.returns', group: 'stock' },
  { id: 'backlog', route: '/backlog', resource: 'backlog', icon: '⏱', titleKey: 'more.backlog', group: 'stock' },
  { id: 'production', route: '/production', resource: 'production', icon: '🏭', titleKey: 'more.production', group: 'stock' },
  { id: 'slots', route: '/slots', resource: 'slot', icon: '🗄️', titleKey: 'more.slots', group: 'stock' },
  { id: 'replenishment', route: '/replenishments', resource: 'replenishment', icon: '🚚', titleKey: 'more.replenishment', group: 'stock' },
  { id: 'purchase-orders', route: '/purchase-orders', resource: 'purchase-order', icon: '🧾', titleKey: 'more.purchaseOrders', group: 'stock' },
  { id: 'suppliers', route: '/suppliers', resource: 'supplier', icon: '🚚', titleKey: 'more.suppliers', group: 'stock' },
  { id: 'supplier-prices', route: '/supplier-prices', resource: 'supplier', icon: '🏷️', titleKey: 'more.supplierPrices', group: 'stock' },
];

/**
 * The modules the role may read, minus those whose branch setting is off and those the store's business
 * type / edition leaves out (TYPE_POS, like the web menu). `enabled` gives a setting's value.
 */
export function visibleModules(user: StaffUser | null | undefined, enabled: (option: string) => string | null = () => '1'): AppModule[] {
  const kind = storeKind(enabled('TYPE_POS'));
  return MODULES.filter(
    (m) => (m.resource === null || can(user, m.resource, 'read')) && (!m.setting || enabled(m.setting) === '1') && isModuleForStore(m.id, kind),
  );
}

/** Detail screens opened from a module (not in the menu themselves), by the module they belong to. */
const DETAIL_ROUTES: [prefix: string, moduleId: string][] = [
  ['/table', 'tables'],
  ['/promotion-set', 'promotion-sets'],
  ['/purchase-order', 'purchase-orders'],
  ['/replenishment', 'replenishment'],
  ['/deliveries', 'deliveries'],
];

/** The module a screen path belongs to (e.g. "/purchase-order/12" → purchase-orders), or null. */
export function moduleIdForPath(path: string): string | null {
  const under = (p: string) => path === p || path.startsWith(p + '/');
  return MODULES.find((m) => under(m.route))?.id ?? DETAIL_ROUTES.find(([p]) => under(p))?.[1] ?? null;
}

export const GROUP_ORDER: ModuleGroup[] = ['daily', 'reports', 'stock', 'setup'];

/**
 * Where the app opens after signing in, like the web: the dashboard for whoever may see it, the tables
 * for a restaurant role, otherwise the first module they may open (More).
 */
export function homeRoute(user: StaffUser | null | undefined): string {
  if (!user?.role) return '/more';
  // owners and managers start on Home (today's sales, tables in use, every module)
  if (user.role.role === 'OWNER' || can(user, 'dashboard', 'read')) return '/home';
  if (user.role.role.toUpperCase() === 'BOARD MEMBER' && can(user, 'board-member-dashboard', 'read')) return '/board';
  if (can(user, 'restaurant', 'read')) return '/tables';
  const first = visibleModules(user).find((m) => m.resource !== null && !m.setting);
  return first ? first.route : '/more';
}

/** Sorts items A to Z by their (already translated) label, in the app's language. */
export function sortByLabel<T>(items: T[], label: (item: T) => string, locale?: string): T[] {
  return [...items].sort((a, b) => label(a).localeCompare(label(b), locale));
}
