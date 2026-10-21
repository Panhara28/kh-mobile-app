/**
 * The Product page of the kh-pos web app: the filters, what a row shows (stock, low-stock warning,
 * price, category), the per-variant actions, the supplier prices of a variant and the shelf label.
 */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export interface ListVariant {
  id: string;
  productId?: string;
  name: string;
  barcode?: string | null;
  price: number | null;
  stock?: number | null;
  lowStockQty?: number | null;
  idealStockQty?: number | null;
  optionValues?: { id: string; value: string }[];
  isComposite?: boolean;
  visible?: boolean;
  isPopular?: boolean;
  isNew?: boolean;
  isMostOrder?: boolean;
  discountType?: 'AMOUNT' | 'PERCENTAGE' | null;
  discountValue?: number | null;
  discountedPrice?: number | null;
  compositeVariants?: { id?: string; qty: number; componentVariant: { id: string; name?: string | null; basicProduct?: { title?: string | null } | null } }[];
}

export interface ListProduct {
  id: string;
  title: string | null;
  createdAt?: string | null;
  isForSale?: boolean;
  trackStock?: boolean;
  supplierId?: string | null;
  productImages?: { url: string; imageOrder?: number | null; productVariantId?: string | null }[];
  productCategories?: { categoryId?: string; title?: string | null }[];
  productVariants?: ListVariant[];
  productConversions?: unknown[];
}

export interface ListFilter {
  text: string;
  barcode: string;
  supplierId: string;
  categoryId: string;
  limit: number;
  offset: number;
}

/** The web only searches by title from 4 characters on, so short typing does not hit the server. */
export const MIN_SEARCH = 4;

export function listQuery(f: ListFilter): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  const text = f.text.trim();
  if (text.length >= MIN_SEARCH) {
    q.set('searchTitle', text);
    q.set('offset', '0');
  }
  if (f.supplierId) q.set('supplierId', f.supplierId);
  if (f.barcode.trim()) q.set('barcode', f.barcode.trim());
  if (f.categoryId) q.set('categoryId', f.categoryId);
  return q.toString();
}

/** A variant's name as the web shows it: its option values joined with " / ". */
export const variantTitle = (v: Pick<ListVariant, 'name' | 'optionValues'>) => (v.optionValues && v.optionValues.length > 0 ? v.optionValues.map((o) => o.value).join(' / ') : v.name);

export const hasConversion = (p: Pick<ListProduct, 'productConversions'>) => (p.productConversions?.length ?? 0) > 0;

/** Total stock of the product, or null ("N/A") when it has unit conversions (the units are not additive). */
export function productStock(p: ListProduct): number | null {
  if (hasConversion(p)) return null;
  return (p.productVariants ?? []).reduce((s, v) => s + n(v.stock), 0);
}

/** A variant is low when its stock is under its low-stock level. */
export const variantIsLow = (v: Pick<ListVariant, 'stock' | 'lowStockQty'>) => n(v.stock) < n(v.lowStockQty);

/** The product shows "Low Stock" only when it tracks stock and one of its variants is low. */
export const productIsLow = (p: ListProduct) => !!p.trackStock && (p.productVariants ?? []).some(variantIsLow);

export const firstPrice = (p: ListProduct) => (p.productVariants && p.productVariants.length > 0 ? n(p.productVariants[0]!.price) : 0);

export function productImage(p: ListProduct): string | null {
  const images = [...(p.productImages ?? [])].sort((a, b) => n(a.imageOrder) - n(b.imageOrder));
  return (images.find((i) => !i.productVariantId) ?? images[0])?.url ?? null;
}

export const variantImage = (p: ListProduct, variantId: string): string | null => p.productImages?.find((i) => i.productVariantId === variantId)?.url ?? null;

/** Products can be added or edited only in the main branch, by someone who may create (or update). */
export const canManageProducts = (isMain: boolean, allowed: boolean) => isMain && allowed;

/** A branch that is not the main one but follows the main branch's product groups can switch things per branch. */
export const hasBranchSwitches = (branch: { isMain?: boolean; useMainBranchVisibility?: boolean | null } | null | undefined) => !!branch && !branch.isMain && !!branch.useMainBranchVisibility;

export type VariantAction = 'transaction' | 'count' | 'stockIn' | 'stockOut' | 'supplierPrice' | 'printLabel';
export const VARIANT_ACTIONS: VariantAction[] = ['transaction', 'count', 'stockIn', 'stockOut', 'supplierPrice', 'printLabel'];

/** Count and Stock In of a composite variant work on its components, so the cashier is asked first. */
export const needsComponentChoice = (v: ListVariant, action: VariantAction) => !!v.isComposite && (action === 'count' || action === 'stockIn') && (v.compositeVariants?.length ?? 0) > 0;

/** The component choices for a composite variant: [{ variantId, name }]. */
export function componentChoices(v: ListVariant): { variantId: string; name: string }[] {
  return (v.compositeVariants ?? []).map((c) => ({ variantId: c.componentVariant.id, name: `${c.componentVariant.basicProduct?.title ?? ''} (${c.componentVariant.name ?? ''})`.trim() }));
}

// ---- supplier prices of a variant ----

export interface SupplierPriceRow {
  id?: string;
  price: number;
  effectDate?: string | null;
  scheduledPrice?: number | null;
  scheduledAt?: string | null;
  supplier?: { id?: string; name?: string | null } | null;
}

export interface SupplierPriceForm {
  supplierId: string;
  price: number;
  scheduledPrice: number;
  scheduledAt: string;
}

export const emptySupplierPrice = (): SupplierPriceForm => ({ supplierId: '', price: 0, scheduledPrice: 0, scheduledAt: '' });

export const supplierPriceForm = (r: SupplierPriceRow): SupplierPriceForm => ({ supplierId: r.supplier?.id ?? '', price: n(r.price), scheduledPrice: n(r.scheduledPrice), scheduledAt: r.scheduledAt ? r.scheduledAt.slice(0, 10) : '' });

export function validateSupplierPrice(f: SupplierPriceForm): 'supplier' | 'price' | 'scheduled' | null {
  if (!f.supplierId) return 'supplier';
  if (!(n(f.price) >= 0)) return 'price';
  if (f.scheduledAt && (!/^\d{4}-\d{2}-\d{2}$/.test(f.scheduledAt) || !(n(f.scheduledPrice) >= 0))) return 'scheduled';
  return null;
}

/** POST takes a list of new prices. */
export const supplierPriceCreateBody = (variantId: string, f: SupplierPriceForm) => [{ supplierId: f.supplierId, productVariantId: variantId, price: n(f.price) }];

/** PUT changes one, optionally scheduling a later price. */
export function supplierPriceUpdateBody(id: string, variantId: string, f: SupplierPriceForm) {
  return { id, supplierId: f.supplierId, productVariantId: variantId, price: n(f.price), ...(f.scheduledAt ? { scheduledAt: `${f.scheduledAt} 00:00:00`, scheduledPrice: n(f.scheduledPrice) } : {}) };
}

// ---- the shelf label ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The label's HTML: product, variant, price (and the discounted price), barcode — printed `copies` times, one per page. */
export function labelHtml(p: { title: string; variant: string; barcode: string; price: number; discountedPrice?: number | null; currency: string; copies: number; widthMm?: number }): string {
  const w = p.widthMm ?? 58;
  const money = (v: number) => `${esc(p.currency)}${cents(v).toFixed(2)}`;
  const one = `<div class="label"><div class="t">${esc(p.title)}</div>${p.variant && p.variant !== 'ns' ? `<div class="v">${esc(p.variant)}</div>` : ''}<div class="p">${p.discountedPrice != null && p.discountedPrice < p.price ? `<s>${money(p.price)}</s> ${money(p.discountedPrice)}` : money(p.price)}</div>${p.barcode ? `<div class="b">${esc(p.barcode)}</div>` : ''}</div>`;
  const copies = Math.max(1, Math.min(200, Math.floor(p.copies) || 1));
  return `<html><head><meta charset="utf-8"/><style>@page{size:${w}mm auto;margin:2mm}body{margin:0;font-family:sans-serif}.label{width:${w - 4}mm;text-align:center;page-break-after:always;padding:1mm 0}.t{font-weight:700;font-size:13px}.v{font-size:11px}.p{font-size:16px;font-weight:700;margin:2px 0}.b{font-family:monospace;font-size:12px;letter-spacing:2px}</style></head><body>${Array.from({ length: copies }, () => one).join('')}</body></html>`;
}
