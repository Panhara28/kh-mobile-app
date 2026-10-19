/**
 * Menu setup data (categories, modifiers, discounts, suppliers, payment methods): the shapes
 * kh-pos sends, the forms the app edits, and the bodies it posts back.
 */

export interface Option {
  value: string;
  label: string;
}

/** Reads every page of a `{ data, total }` list (kh-pos pages at 100 at most). */
export async function fetchAllPages<T>(get: (offset: number, limit: number) => Promise<{ data: T[]; total: number }>, limit = 100, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const r = await get(out.length, limit);
    out.push(...r.data);
    if (r.data.length < limit || out.length >= Number(r.total)) break;
  }
  return out;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => Number(v) || 0;

// ---- categories ----

export interface CategoryRow {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  printerId?: string | null;
  sortOrder?: number | null;
  excludeFeeDelivery?: boolean | null;
  markExtraFee?: number | null;
  productCount?: number;
  forSaleCount?: number;
  printer?: { name?: string | null } | null;
}

// ---- modifiers ----

export interface ModifierRow {
  modifierId: string;
  title: string;
  description?: string | null;
  items: { id: string; name: string; price: number | string }[];
}

export interface ModifierForm {
  title: string;
  description: string;
  /** One option per line: "Name = price" (price may be left out for 0). */
  items: string;
  [key: string]: unknown;
}

export const emptyModifier = (): ModifierForm => ({ title: '', description: '', items: '' });

export const itemsToText = (items: ModifierRow['items']) => items.map((i) => `${i.name} = ${num(i.price)}`).join('\n');

/** "Egg = 0.5" lines → options. Empty lines and lines without a name are dropped; a missing or bad price is 0. */
export function parseModifierItems(textValue: string): { name: string; price: number }[] {
  const out: { name: string; price: number }[] = [];
  for (const raw of textValue.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.lastIndexOf('=');
    const name = (eq >= 0 ? line.slice(0, eq) : line).trim();
    const price = eq >= 0 ? Number(line.slice(eq + 1).replace(/[$,\s]/g, '')) : 0;
    if (!name) continue;
    out.push({ name, price: Number.isFinite(price) && price > 0 ? price : 0 });
  }
  return out;
}

export const modifierForm = (r: ModifierRow): ModifierForm => ({ title: r.title, description: text(r.description), items: itemsToText(r.items) });

/**
 * kh-pos only saves the options that come with an id on update (it replaces them all), so every
 * option is sent with one: the existing id when the name is unchanged, otherwise a new one.
 */
export function modifierBody(f: ModifierForm, newId: () => string, existing?: ModifierRow) {
  const byName = new Map((existing?.items ?? []).map((i) => [i.name.toLowerCase(), i.id]));
  return {
    ...(existing ? { id: existing.modifierId } : {}),
    title: f.title.trim(),
    description: f.description.trim(),
    items: parseModifierItems(f.items).map((i) => ({ id: byName.get(i.name.toLowerCase()) ?? newId(), name: i.name, price: i.price })),
  };
}

// ---- discounts ----

export interface DiscountRow {
  id: string;
  title: string;
  description?: string | null;
  discountType: 'AMOUNT' | 'PERCENTAGE';
  value: number;
  warehouseId?: string;
}

export interface DiscountForm {
  title: string;
  description: string;
  discountType: string;
  value: number;
  [key: string]: unknown;
}

export const emptyDiscount = (): DiscountForm => ({ title: '', description: '', discountType: 'PERCENTAGE', value: 0 });
export const discountForm = (r: DiscountRow): DiscountForm => ({ title: r.title, description: text(r.description), discountType: r.discountType, value: num(r.value) });

export function validateDiscount(f: DiscountForm): string | null {
  if (!f.title.trim()) return 'title';
  if (f.discountType !== 'AMOUNT' && f.discountType !== 'PERCENTAGE') return 'discountType';
  if (!(f.value > 0)) return 'value';
  if (f.discountType === 'PERCENTAGE' && f.value > 100) return 'value';
  return null;
}

export function discountBody(f: DiscountForm, warehouseId: string, newId: () => string, existing?: DiscountRow) {
  return {
    id: existing?.id ?? newId(),
    title: f.title.trim(),
    description: f.description.trim(),
    discountType: f.discountType as 'AMOUNT' | 'PERCENTAGE',
    value: f.value,
    warehouseId: existing?.warehouseId || warehouseId,
  };
}

// ---- suppliers ----

export interface SupplierRow {
  id: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  note?: string | null;
  isConsignment?: boolean | number | null;
}

export interface SupplierForm {
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  note: string;
  isConsignment: boolean;
  [key: string]: unknown;
}

export const emptySupplier = (): SupplierForm => ({ name: '', contactName: '', contactPhone: '', contactEmail: '', address: '', note: '', isConsignment: false });
export const supplierForm = (r: SupplierRow): SupplierForm => ({
  name: r.name,
  contactName: text(r.contactName),
  contactPhone: text(r.contactPhone),
  contactEmail: text(r.contactEmail),
  address: text(r.address),
  note: text(r.note),
  isConsignment: !!r.isConsignment,
});
export const supplierBody = (f: SupplierForm, existing?: SupplierRow) => ({
  ...(existing ? { id: existing.id } : {}),
  name: f.name.trim(),
  contactName: f.contactName.trim(),
  contactPhone: f.contactPhone.trim(),
  contactEmail: f.contactEmail.trim(),
  address: f.address.trim(),
  note: f.note.trim(),
  isConsignment: f.isConsignment,
});

// ---- payment methods ----

export interface PaymentMethodForm {
  method: string;
  [key: string]: unknown;
}
