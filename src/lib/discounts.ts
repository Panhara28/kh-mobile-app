/**
 * The Discount tab of the kh-pos web Discount page: campaigns (a name, percentage or fixed amount,
 * a value, a description) and what each applies to: all products, chosen products (optionally only
 * some of their variants) or chosen categories.
 */

const n = (v: unknown) => Number(v) || 0;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export type DiscountKind = 'AMOUNT' | 'PERCENTAGE';

/** One row of "what a discount applies to" as GET /api/discount sends it (table product_discount). */
export interface AppliedRow {
  product_id?: string | null;
  variant_id?: string | null;
  category_id?: string | null;
  is_applied_all?: number | boolean | null;
}

export interface DiscountItem {
  id: string;
  title: string;
  description?: string | null;
  discountType: DiscountKind;
  value: number;
  warehouseId?: string;
  createdAt?: string | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
  warehouse?: { name?: string | null } | null;
  applied?: AppliedRow[];
}

export type DiscountFormData = {
  title: string;
  description: string;
  discountType: DiscountKind;
  value: number;
};

export const emptyDiscountForm = (): DiscountFormData => ({ title: '', description: '', discountType: 'AMOUNT', value: 0 });
export const discountFormOf = (d: DiscountItem): DiscountFormData => ({ title: d.title, description: text(d.description), discountType: d.discountType, value: n(d.value) });

export type DiscountProblem = 'title' | 'value' | 'percent';

/** A name, a value of at least 1 (the web's minimum), and for a percentage not above 100. */
export function discountProblem(f: DiscountFormData): DiscountProblem | null {
  if (!f.title.trim()) return 'title';
  if (!(f.value > 0)) return 'value';
  if (f.discountType === 'PERCENTAGE' && f.value > 100) return 'percent';
  return null;
}

/** The body kh-pos wants; a new campaign gets its id here, an edited one keeps its id and branch. */
export function discountSaveBody(f: DiscountFormData, warehouseId: string, newId: () => string, existing?: DiscountItem) {
  return {
    id: existing?.id ?? newId(),
    title: f.title.trim(),
    description: f.description,
    discountType: f.discountType,
    value: n(f.value),
    warehouseId: existing?.warehouseId || warehouseId,
  };
}

/** "$ 5" for an amount, "10%" for a percentage, as the list shows it. */
export function discountText(d: Pick<DiscountItem, 'discountType' | 'value'>, currency: string): string {
  return d.discountType === 'AMOUNT' ? `${currency} ${d.value}` : `${d.value}%`;
}

export type AppliesKind = 'all' | 'variants' | 'products' | 'categories';

/** What the "Applies On" column says: All Products, Specific Variants (n), Specific Products (n) or Categories (n). */
export function appliesOn(d: Pick<DiscountItem, 'applied'>): { kind: AppliesKind; count: number } {
  const rows = d.applied ?? [];
  if (rows.some((r) => !!r.is_applied_all)) return { kind: 'all', count: 0 };
  const variants = rows.filter((r) => !!r.variant_id).length;
  if (variants > 0) return { kind: 'variants', count: variants };
  const products = rows.filter((r) => !!r.product_id).length;
  if (products > 0) return { kind: 'products', count: products };
  return { kind: 'categories', count: rows.filter((r) => !!r.category_id).length };
}

export function matchesDiscount(d: Pick<DiscountItem, 'title' | 'description'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || d.title.toLowerCase().includes(q) || text(d.description).toLowerCase().includes(q);
}

// ---- what a campaign applies to (GET /api/discount/applies?id=) ----

export interface AppliesRow {
  productId?: string | null;
  variantId?: string | null;
  isAppliedAll?: boolean;
  product?: { id: string; title?: string | null; images?: { url: string }[] } | null;
  productVariants?: { id: string; name: string; price: number | null }[] | null;
  category?: { id: string; title: string; imageUrl?: string | null } | null;
}

export interface AppliedProduct {
  id: string;
  title: string;
  image: string | null;
  variants: { id: string; name: string; price: number | null }[];
  /** The variants it is limited to; empty = every variant. */
  selected: string[];
}

export interface AppliesState {
  all: boolean;
  products: AppliedProduct[];
  categories: { id: string; title: string; imageUrl?: string | null }[];
  /** The tab the web opens first. */
  tab: 'all' | 'product' | 'category';
}

/** Reads the rows the server sends: one product card (rows repeat a product per limited variant), the categories, and "all". */
export function appliesState(rows: AppliesRow[]): AppliesState {
  const all = rows.some((r) => !!r.isAppliedAll);
  const products: AppliedProduct[] = [];
  for (const r of rows) {
    if (!r.productId || !r.product) continue;
    let p = products.find((x) => x.id === r.product!.id);
    if (!p) {
      p = { id: r.product.id, title: r.product.title ?? '', image: r.product.images?.[0]?.url ?? null, variants: r.productVariants ?? [], selected: [] };
      products.push(p);
    }
    if (r.variantId && !p.selected.includes(r.variantId)) p.selected.push(r.variantId);
  }
  const categories = rows.filter((r) => !!r.category).map((r) => r.category!);
  return { all, products, categories, tab: all ? 'all' : products.length > 0 ? 'product' : 'category' };
}

/** Switching to or from "All Products" changes the server; switching between Product and Category does not. */
export const tabChangesServer = (from: string, to: string) => (from === 'all' && to !== 'all') || (from !== 'all' && to === 'all');

export type Change = { discountId: string; action: 'insert' | 'delete'; productId?: string; variantId?: string; categoryId?: string; isAppliedAll?: boolean };

export const allChange = (discountId: string, on: boolean): Change => ({ discountId, isAppliedAll: true, action: on ? 'insert' : 'delete' });
export const productChange = (discountId: string, productId: string, on: boolean): Change => ({ discountId, productId, action: on ? 'insert' : 'delete' });
export const variantChange = (discountId: string, productId: string, variantId: string, on: boolean): Change => ({ discountId, productId, variantId, action: on ? 'insert' : 'delete' });
export const categoryChange = (discountId: string, categoryId: string, on: boolean): Change => ({ discountId, categoryId, action: on ? 'insert' : 'delete' });

/** Limiting a product to variants: ticking adds one; unticking the last one puts the product back to "all variants". */
export function variantToggle(discountId: string, p: Pick<AppliedProduct, 'id' | 'selected'>, variantId: string, on: boolean): Change[] {
  const next = on ? [...p.selected, variantId] : p.selected.filter((v) => v !== variantId);
  const changes: Change[] = [variantChange(discountId, p.id, variantId, on)];
  if (!on && next.length === 0) changes.push(productChange(discountId, p.id, true));
  return changes;
}

/** Variant ticking is only offered for a product with more than one variant. */
export const canLimitVariants = (p: Pick<AppliedProduct, 'variants'>) => p.variants.length > 1;

export const appliesBody = (changes: Change[]) => ({ data: changes });
