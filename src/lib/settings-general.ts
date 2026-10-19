/**
 * Settings → General, like the web Settings dialog: one category per setting option, each edited with
 * its own editor and saved with its own Save. Mirrors kh-pos `setting-core`, `setting-utils` and the
 * editor components (the stored text of every setting is kept exactly as the web writes it).
 */
import type { SettingRow } from '@/lib/settings-admin';

export type SettingType =
  | 'text'
  | 'number'
  | 'json'
  | 'json-array'
  | 'qr-code'
  | 'invoice'
  | 'print-server'
  | 'type-pos'
  | 'label-print'
  | 'accessibility'
  | 'product-menu'
  | 'order-discount'
  | 'currency'
  | 'print-socket'
  | 'accounting'
  | 'brand_integration'
  | 'inventory'
  | 'brand';

export interface SettingConfig {
  label: string;
  description: string;
  type: SettingType;
  unit?: string;
  placeholder?: string;
}

export const SETTING_CONFIGS: Record<string, SettingConfig> = {
  EXCHANGE_RATE: { label: 'Exchange Rate', description: 'Current exchange rate from USD to KHR for price calculations', type: 'number', unit: 'KHR', placeholder: 'Enter exchange rate' },
  QR_CODE: { label: 'QR Code', description: 'QR code image displayed on receipts and invoices', type: 'qr-code' },
  TABLE_SELECTION: { label: 'Table Selection', description: 'Available table options for order assignments', type: 'json-array' },
  TABLE_SHAPE: { label: 'Table Shape', description: 'Available table shapes for seating arrangements', type: 'json-array' },
  INVOICE_RECEIPT: { label: 'Invoice Receipt', description: 'Template configuration for invoice and receipt printing', type: 'invoice' },
  ORDER_DISCOUNT_RULES: {
    label: 'Order Discount Rules',
    description: 'Automatic whole-order discounts (order over an amount, or over an item count) and the max quantity a per-line variant discount applies to',
    type: 'order-discount',
  },
  EXPIRY_SETTING: { label: 'Expiry Setting', description: 'Product expiry notification thresholds (urgent, critical, warning days)', type: 'json' },
  EDITABLE_ORDER_DAY: { label: 'Editable Order Day', description: 'Number of days after which orders become non-editable', type: 'number', unit: 'days', placeholder: 'Enter number of days' },
  PRINT_SERVER: { label: 'Print Server', description: 'Configuration settings for the printer server', type: 'print-server' },
  LABEL_PRINT: { label: 'Label Print', description: 'Settings for label printing format and options', type: 'label-print' },
  TYPE_POS: { label: 'Type POS', description: 'Type of Point of Sale system (e.g., MART, RESTAURANT)', type: 'type-pos' },
  ACCESSIBILITY: { label: 'Accessibility', description: 'Accessibility settings for the application', type: 'accessibility' },
  PRODUCT_MENU: { label: 'Product Menu Rules', description: 'Rules for displaying products in the menu', type: 'product-menu' },
  CURRENCY: { label: 'Currency', description: 'Default currency for the application', type: 'currency' },
  PRINT_SOCKET: { label: 'Print Socket', description: 'Socket settings for cinema reservation printing', type: 'print-socket' },
  RTB: { label: 'អ ត​ ប', description: '', type: 'text' },
  ACCOUNTING: { label: 'Accounting', description: 'Accounting related settings', type: 'accounting' },
  BRAND_INTEGRATION: { label: 'Brand Integration', description: 'Settings for integrating with external brand systems', type: 'brand_integration' },
  INVENTORY: { label: 'Inventory', description: 'Settings related to inventory management', type: 'inventory' },
  BRAND: { label: 'Brand', description: 'Brand information such as title, description, and icon', type: 'brand' },
};

/** What an unknown setting's text looks like (the web guesses the editor from the value). */
export function detectValueType(value: string): SettingType {
  const v = (value ?? '').trim();
  if (!v) return 'text';
  if (/^\d+\.?\d*$/.test(v)) return 'number';
  if (v.startsWith('[') && v.endsWith(']')) {
    try {
      if (Array.isArray(JSON.parse(v))) return 'json-array';
    } catch {
      return 'text';
    }
  }
  if (v.startsWith('{') && v.endsWith('}')) {
    try {
      JSON.parse(v);
      return 'json';
    } catch {
      return 'text';
    }
  }
  return 'text';
}

export function getSettingConfig(option: string, value?: string): SettingConfig {
  const known = SETTING_CONFIGS[option];
  if (known) return known;
  return {
    label: option
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' '),
    description: 'Application configuration setting',
    type: value ? detectValueType(value) : 'text',
  };
}

export interface SettingCategory {
  id: string;
  label: string;
  option: string;
}

const RESTAURANT_ONLY = ['PRINT_SERVER', 'TABLE_SHAPE', 'TABLE_SELECTION'];
const CINEMA_ONLY = ['PRINT_SOCKET'];
const MAIN_OR_DEV_ONLY = ['CURRENCY', 'EXCHANGE_RATE'];

/** The POS type chosen in the TYPE_POS setting ('' when there is none). */
export function systemType(rows: SettingRow[]): string {
  try {
    return JSON.parse(rows.find((r) => r.option === 'TYPE_POS')?.value || '{}').system_type || '';
  } catch {
    return '';
  }
}

/** The categories of the sidebar: restaurant / cinema sections only for that POS type, currency only on the main branch (or a developer). */
export function generateCategories(rows: SettingRow[], isDevOrMain: boolean): SettingCategory[] {
  const type = systemType(rows);
  let items = rows;
  if (type !== 'RESTAURANT') items = items.filter((r) => !RESTAURANT_ONLY.includes(r.option ?? ''));
  if (type !== 'CINEMA') items = items.filter((r) => !CINEMA_ONLY.includes(r.option ?? ''));
  const options = Array.from(new Set(items.map((r) => r.option).filter((o): o is string => !!o)));
  const shown = isDevOrMain ? options : options.filter((o) => !MAIN_OR_DEV_ONLY.includes(o));
  return shown.map((option) => ({ id: option.toLowerCase().replace(/_/g, '-'), label: getSettingConfig(option).label, option }));
}

export function settingsForCategory(rows: SettingRow[], category: SettingCategory | undefined): SettingRow[] {
  return category ? rows.filter((r) => r.option === category.option) : [];
}

/** A branch's own row may be edited anywhere; the shared (all branches) row only on the main branch. */
export function canEditSetting(row: SettingRow, isMainBranch: boolean): boolean {
  return !!row.warehouse || isMainBranch;
}

// ---------- numbers ----------

/** The web number box takes any number; empty is refused on the phone so a blank can't be saved over a rate. */
export function cleanNumber(raw: string): string | null {
  const v = raw.trim().replace(/,/g, '');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? v : null;
}

// ---------- Type POS ----------

export interface TypePosValue {
  system_type: string;
  shared_order_draft: boolean;
  enviroment: string;
}

export const SYSTEM_TYPES = [
  { value: 'MART', label: 'Mart' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'CINEMA', label: 'Cinema' },
];
export const ENVIRONMENTS = [
  { value: 'production', label: 'Production' },
  { value: 'testing', label: 'Testing' },
];

export function parseTypePos(raw: string): TypePosValue {
  try {
    const p = raw ? JSON.parse(raw) : {};
    return { system_type: p.system_type ?? '', shared_order_draft: p.shared_order_draft ?? false, enviroment: p.enviroment ?? 'production' };
  } catch {
    return { system_type: '', shared_order_draft: false, enviroment: 'production' };
  }
}

/** Choosing Restaurant turns the shared order draft on (the web does this), and the switch is hidden for it. */
export function typePosWithSystem(v: TypePosValue, system: string): TypePosValue {
  return { ...v, system_type: system, shared_order_draft: system === 'RESTAURANT' ? true : v.shared_order_draft };
}

// ---------- Invoice receipt (comma separated text) ----------

export interface InvoiceValue {
  template: string;
  title: string;
  logoUrl: string;
  settings: string;
  limitProductName: string;
  productNameLimitLine: string;
  autoResetEveryDay: string;
  discountDisplayFormat: string;
  showTotalDiscount: string;
  receiptCountPerCheckout: string;
}

export const INVOICE_TEMPLATES = [
  { value: 'default', label: 'Default' },
  { value: 'template-i', label: 'Template I' },
  { value: 'template-ch', label: 'Template CH' },
  { value: 'template-funbeerking', label: 'Template Funbeerking' },
];

export function parseInvoice(raw: string): InvoiceValue {
  const p = (raw ?? '').split(',');
  return {
    template: p[0] || 'template-i',
    title: p[1] || '',
    logoUrl: p[2] || '',
    settings: p[3] || '2 2 2 2',
    limitProductName: p[4] || '0',
    productNameLimitLine: p[5] || '1',
    autoResetEveryDay: p[6] || '0',
    discountDisplayFormat: p[7] || 'amount',
    showTotalDiscount: p[8] || 'none',
    receiptCountPerCheckout: p[9] || '1',
  };
}

export function serializeInvoice(v: InvoiceValue): string {
  return [v.template, v.title, v.logoUrl, v.settings, v.limitProductName, v.productNameLimitLine, v.autoResetEveryDay, v.discountDisplayFormat, v.showTotalDiscount, v.receiptCountPerCheckout].join(',');
}

/** The four paddings are kept as "top right bottom left" in one field. */
export const PADDING_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export function paddingAt(settings: string, i: number): string {
  return settings.split(' ')[i] ?? '';
}
export function withPadding(settings: string, i: number, value: string): string {
  const parts = settings.split(' ');
  parts[i] = value;
  return parts.join(' ');
}

/** The comma separates the fields, so a comma typed into the title or logo address is dropped (it would shift every later field). */
export const stripCommas = (text: string) => text.replace(/,/g, '');

// ---------- Order discount rules ----------

export type DiscountType = 'AMOUNT' | 'PERCENTAGE';
export type CountBy = 'VARIANT' | 'PRODUCT' | 'CATEGORY';
export interface ThresholdRule {
  enabled: boolean;
  min: number;
  discountType: DiscountType;
  value: number;
}
export interface OrderDiscountRules {
  amountRule: ThresholdRule;
  qtyRule: ThresholdRule;
  maxQtyPerLine: { enabled: boolean; value: number; countBy: CountBy };
}

export const DEFAULT_ORDER_DISCOUNT_RULES: OrderDiscountRules = {
  amountRule: { enabled: false, min: 100, discountType: 'PERCENTAGE', value: 0 },
  qtyRule: { enabled: false, min: 50, discountType: 'PERCENTAGE', value: 0 },
  maxQtyPerLine: { enabled: true, value: 3, countBy: 'VARIANT' },
};

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function parseThreshold(raw: unknown, fb: ThresholdRule): ThresholdRule {
  const r = (raw ?? {}) as Record<string, unknown>;
  const min = r.min !== undefined ? num(r.min, fb.min) : r.minAmount !== undefined ? num(r.minAmount, fb.min) : r.minQty !== undefined ? num(r.minQty, fb.min) : fb.min;
  return {
    enabled: Boolean(r.enabled),
    min,
    discountType: r.discountType === 'AMOUNT' || r.discountType === 'PERCENTAGE' ? r.discountType : fb.discountType,
    value: num(r.value, fb.value),
  };
}

export function parseOrderDiscountRules(value: string | null | undefined): OrderDiscountRules {
  let obj: Record<string, unknown> = {};
  if (value) {
    try {
      const p = JSON.parse(value);
      if (p && typeof p === 'object') obj = p as Record<string, unknown>;
    } catch {
      // defaults
    }
  }
  const m = (obj.maxQtyPerLine ?? {}) as Record<string, unknown>;
  const d = DEFAULT_ORDER_DISCOUNT_RULES.maxQtyPerLine;
  return {
    amountRule: parseThreshold(obj.amountRule, DEFAULT_ORDER_DISCOUNT_RULES.amountRule),
    qtyRule: parseThreshold(obj.qtyRule, DEFAULT_ORDER_DISCOUNT_RULES.qtyRule),
    maxQtyPerLine: {
      enabled: m.enabled === undefined ? d.enabled : Boolean(m.enabled),
      value: num(m.value, d.value),
      countBy: m.countBy === 'VARIANT' || m.countBy === 'PRODUCT' || m.countBy === 'CATEGORY' ? m.countBy : d.countBy,
    },
  };
}

/** Back to the stored shape (the amount rule keeps `minAmount`, the quantity rule `minQty`). */
export function serializeOrderDiscountRules(r: OrderDiscountRules): string {
  return JSON.stringify({
    amountRule: { enabled: r.amountRule.enabled, minAmount: r.amountRule.min, discountType: r.amountRule.discountType, value: r.amountRule.value },
    qtyRule: { enabled: r.qtyRule.enabled, minQty: r.qtyRule.min, discountType: r.qtyRule.discountType, value: r.qtyRule.value },
    maxQtyPerLine: { enabled: r.maxQtyPerLine.enabled, value: r.maxQtyPerLine.value, countBy: r.maxQtyPerLine.countBy },
  });
}

// ---------- Product menu rules ----------

export interface ProductMenuValue {
  onlyForSale: boolean;
  onlyInStock: boolean;
  bannerUrl: string;
}

export function parseProductMenu(raw: string): ProductMenuValue {
  let p: Record<string, unknown> | null = null;
  try {
    p = raw ? JSON.parse(raw) : null;
  } catch {
    p = null;
  }
  return { onlyForSale: Boolean(p?.onlyForSale), onlyInStock: Boolean(p?.onlyInStock), bannerUrl: (p?.bannerUrl as string) || '' };
}

/** The public menu link shown beside the rules: the web address plus this branch. */
export function menuLink(baseUrl: string, warehouseId: string | undefined | null): string {
  return `${baseUrl.replace(/\/+$/, '')}/menu?warehouse=${warehouseId ?? ''}`;
}

// ---------- Print server ----------

export interface ServerPrinter {
  id?: string;
  name: string;
  printer_name: string;
  ip: string;
  port: number;
}
export interface PrintServerValue {
  group_by: string;
  printers: ServerPrinter[];
  /** Anything else stored in the setting is kept untouched. */
  rest: Record<string, unknown>;
}

export function parsePrintServer(raw: string): PrintServerValue {
  try {
    const p = raw ? JSON.parse(raw) : {};
    const { printers, group_by, ...rest } = p as Record<string, unknown>;
    return { group_by: (group_by as string) || 'ITEM', printers: Array.isArray(printers) ? (printers as ServerPrinter[]) : [], rest };
  } catch {
    return { group_by: 'ITEM', printers: [], rest: {} };
  }
}

export function serializePrintServer(v: PrintServerValue): string {
  return JSON.stringify({ ...v.rest, group_by: v.group_by, printers: v.printers });
}

export const newPrinterId = () => Math.random().toString(36).slice(2, 10);

export function printerValid(p: { name: string; printer_name: string; ip: string }): boolean {
  return !!p.name.trim() && !!p.printer_name.trim() && !!p.ip.trim();
}

/** The web never lets the last printer go. */
export function canRemovePrinter(count: number): boolean {
  return count > 1;
}

export function parsePort(raw: string): number {
  return parseInt(raw, 10) || 9100;
}

// ---------- Print socket (cinema) ----------

export interface PrintSocketValue {
  url: string;
  printers: { id: string; name: string; printer_name: string; ip: string; port: number };
  print_server_ip: string;
}

export const DEFAULT_PRINT_SOCKET: PrintSocketValue = {
  url: 'ws://localhost:8181',
  printers: { id: '1', name: 'Cashier Printer', printer_name: 'XP-80C', ip: '127.0.0.1', port: 9100 },
  print_server_ip: '192.168.1.100:8080',
};

export function parsePrintSocket(raw: string): PrintSocketValue {
  const d = DEFAULT_PRINT_SOCKET;
  try {
    const p = raw ? JSON.parse(raw) : d;
    return {
      url: p.url || d.url,
      printers: {
        id: p.printers?.id || d.printers.id,
        name: p.printers?.name || d.printers.name,
        printer_name: p.printers?.printer_name || d.printers.printer_name,
        ip: p.printers?.ip || d.printers.ip,
        port: p.printers?.port || d.printers.port,
      },
      print_server_ip: p.print_server_ip || d.print_server_ip,
    };
  } catch {
    return d;
  }
}

// ---------- Label print ----------

export interface LabelPrintValue {
  paperSize: { width?: number; height?: number; padding: { top?: number; right?: number; bottom?: number; left?: number } };
  price: boolean;
  barcode: { displayValue: boolean; width?: number; height?: number };
  using?: 'SOCKET';
  printerName?: string;
}

export function parseLabelPrint(raw: string): LabelPrintValue {
  let p: Record<string, any> = {};
  try {
    const x = raw ? JSON.parse(raw) : {};
    if (x && typeof x === 'object' && !Array.isArray(x)) p = x;
  } catch {
    p = {};
  }
  return {
    paperSize: { width: p.paperSize?.width, height: p.paperSize?.height, padding: { ...(p.paperSize?.padding ?? {}) } },
    price: !!p.price,
    barcode: { displayValue: !!p.barcode?.displayValue, width: p.barcode?.width, height: p.barcode?.height },
    using: p.using === 'SOCKET' ? 'SOCKET' : undefined,
    printerName: p.printerName,
  };
}

export function serializeLabelPrint(v: LabelPrintValue): string {
  return JSON.stringify(v);
}

/** A typed number for a label box ('' leaves it unset). */
export function labelNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// ---------- Brand ----------

export interface BrandValue {
  title: string;
  description: string;
  icon: string;
}
export function parseBrand(raw: string): BrandValue {
  try {
    const p = raw ? JSON.parse(raw) : {};
    return { title: p?.title || '', description: p?.description || '', icon: p?.icon || '' };
  } catch {
    return { title: '', description: '', icon: '' };
  }
}

// ---------- Brand integration ----------

export interface IntegrationItem {
  name: string;
  url: string;
  token: string;
}
export function parseIntegrations(raw: string): IntegrationItem[] {
  try {
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p.map((i: Partial<IntegrationItem>) => ({ name: i.name ?? '', url: i.url ?? '', token: i.token ?? '' })) : [];
  } catch {
    return [];
  }
}
export const integrationValid = (i: IntegrationItem) => !!i.name.trim() && !!i.url.trim() && !!i.token.trim();

// ---------- Inventory ----------

export interface InventoryValue {
  restrict_product_lot: boolean;
  print_name: string;
}
export function parseInventory(raw: string): InventoryValue {
  try {
    const p = JSON.parse(raw || '{}');
    return { restrict_product_lot: p.restrict_product_lot || false, print_name: p.print_name || '' };
  } catch {
    return { restrict_product_lot: false, print_name: '' };
  }
}

// ---------- Label/value lists and plain key/value objects ----------

export interface LabelValue {
  label: string;
  value: string;
}
export function parseLabelValues(raw: string): LabelValue[] {
  try {
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
export const labelValueValid = (i: LabelValue) => !!i.label.trim() && !!i.value.trim();

export function parseKeyValues(raw: string): Record<string, string> {
  try {
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}
/** A new key is added only when it has a key and a value and the key is not there yet. */
export function canAddKeyValue(obj: Record<string, string>, key: string, value: string): boolean {
  return !!key.trim() && !!value.trim() && !Object.prototype.hasOwnProperty.call(obj, key.trim());
}

// ---------- Accounting ----------

export const accountingOn = (raw: string) => raw === '1';

// ---------- checks before saving ----------

export type SettingProblem = 'number' | 'currency';

/** What would make this text wrong to save for its kind of setting (null = fine). The web checks little; these only stop a blank rate or a shifted receipt field. */
export function validateSetting(type: SettingType, value: string): SettingProblem | null {
  switch (type) {
    case 'number':
      return cleanNumber(value) === null ? 'number' : null;
    case 'currency':
      return value === 'USD' || value === 'KHR' ? null : 'currency';
    default:
      return null;
  }
}
