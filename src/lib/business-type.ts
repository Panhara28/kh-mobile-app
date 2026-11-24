/**
 * The store's business type and edition (TYPE_POS setting), and which modules they leave out: the same
 * rules as the kh-pos web menu (kh-pos-v2 apps/web/src/lib/business-type.ts), keyed by lib/modules ids.
 */
export type BusinessType = 'MART' | 'RESTAURANT' | 'CINEMA';
export type Edition = 'FULL' | 'LITE';

export interface StoreKind {
  /** '' when unknown (settings not loaded, or an old store that never chose): nothing is hidden then. */
  type: string;
  edition: Edition;
}

/** Reads the TYPE_POS setting's JSON value. */
export function storeKind(typePos: string | null | undefined): StoreKind {
  try {
    const v = JSON.parse(typePos || '{}') as { system_type?: unknown; edition?: unknown } | null;
    const type = typeof v?.system_type === 'string' ? v.system_type : '';
    return { type, edition: type === 'RESTAURANT' && v?.edition === 'LITE' ? 'LITE' : 'FULL' };
  } catch {
    return { type: '', edition: 'FULL' };
  }
}

/** Modules that belong to certain business types only (web PAGES). Every other module is shared. */
const ONLY_FOR: Record<string, BusinessType[]> = {
  tables: ['RESTAURANT'],
  'table-setup': ['RESTAURANT'],
  'table-layout': ['RESTAURANT'],
  'report-guest-number': ['RESTAURANT'],
  retail: ['MART', 'CINEMA'],
};

/**
 * A small restaurant (edition LITE) keeps only the basics: tables, orders, payment, shifts and simple
 * reports (web LITE_HIDDEN).
 */
const LITE_HIDDEN = new Set([
  'discounts',
  'promotion-sets',
  'production',
  'branches',
  'slots',
  'stock-movements',
  'product-groups',
  'stock-finding',
  'returns',
  'backlog',
  'deliveries',
  'suppliers',
  'supplier-prices',
  'purchase-orders',
  'replenishment',
  'booking',
  'chart-of-accounts',
  'report-guest-number',
  'report-expiry',
  'report-stock-report',
]);

export function isModuleForStore(id: string, kind: StoreKind): boolean {
  if (!kind.type) return true;
  if (kind.edition === 'LITE' && LITE_HIDDEN.has(id)) return false;
  const only = ONLY_FOR[id];
  return !only || (only as string[]).includes(kind.type);
}
