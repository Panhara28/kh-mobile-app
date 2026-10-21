/**
 * The Supplier Product Price page of the kh-pos web app (Supply > Supplier product price): what each
 * supplier charges for each product variant, with a scheduled later price; filter by supplier or
 * product, search, order by price, add, edit and delete.
 */

const n = (v: unknown) => Number(v) || 0;

export type Order = 'asc' | 'desc';

export const PAGE = 30;

export interface PriceItem {
  id?: string;
  price: number;
  effectDate?: string | null;
  scheduledPrice?: number | null;
  scheduledAt?: string | null;
  variant?: {
    id: string;
    name?: string | null;
    sku?: string | number | null;
    barcode?: string | null;
    price?: number | null;
    stock?: number | null;
    basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null;
  } | null;
  supplier?: { id?: string; name?: string | null; contactPhone?: string | null } | null;
}

export interface PriceFilter {
  search: string;
  supplierId: string;
  productVariantId: string;
  order: Order;
  limit: number;
  offset: number;
}

/** The query the web sends. The server ignores the supplier and product filters while a search text is set. */
export function priceQuery(f: PriceFilter): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset), orderByPrice: f.order });
  if (f.search.trim()) q.set('search', f.search.trim());
  if (f.supplierId) q.set('supplierId', f.supplierId);
  if (f.productVariantId) q.set('productVariantId', f.productVariantId);
  return q.toString();
}

export const hasFilters = (f: Pick<PriceFilter, 'search' | 'supplierId' | 'productVariantId'>) => !!(f.search.trim() || f.supplierId || f.productVariantId);

/** "Product (Variant)" as the web shows it. */
export function productName(p: Pick<PriceItem, 'variant'>): string {
  const v = p.variant;
  if (!v) return '?';
  return `${v.basicProduct?.title ?? ''} (${v.name ?? ''})`.trim();
}

/** The variant's own picture, else the product's first. */
export function priceImage(p: Pick<PriceItem, 'variant'>): string | null {
  const imgs = p.variant?.basicProduct?.images ?? [];
  return (imgs.find((i) => i.productVariantId === p.variant?.id) ?? imgs[0])?.url ?? null;
}

export interface PriceFormData {
  supplierId: string;
  productVariantId: string;
  productTitle: string;
  price: number;
  scheduledPrice: number | null;
  /** YYYY-MM-DD */
  scheduledAt: string;
}

export const emptyPriceForm = (): PriceFormData => ({ supplierId: '', productVariantId: '', productTitle: '', price: 0, scheduledPrice: null, scheduledAt: '' });

export const priceFormOf = (p: PriceItem): PriceFormData => ({
  supplierId: p.supplier?.id ?? '',
  productVariantId: p.variant?.id ?? '',
  productTitle: productName(p),
  price: n(p.price),
  scheduledPrice: p.scheduledPrice ?? null,
  scheduledAt: p.scheduledAt ? p.scheduledAt.slice(0, 10) : '',
});

export type PriceProblem = 'supplier' | 'product' | 'price' | 'scheduledPrice' | 'scheduledAt';

/** The web's rules: a supplier, a product variant, a price above 0; a scheduled price is not negative and a scheduled date looks like a date. */
export function priceProblem(f: PriceFormData): PriceProblem | null {
  if (!f.supplierId) return 'supplier';
  if (!f.productVariantId) return 'product';
  if (!(f.price >= 0.01)) return 'price';
  if (f.scheduledPrice !== null && f.scheduledPrice < 0) return 'scheduledPrice';
  if (f.scheduledAt && !/^\d{4}-\d{2}-\d{2}$/.test(f.scheduledAt)) return 'scheduledAt';
  return null;
}

/** POST takes a list with the new price. */
export const priceCreateBody = (f: PriceFormData) => [{ productVariantId: f.productVariantId, supplierId: f.supplierId, price: f.price }];

/** PUT changes one; the scheduled price and date are sent when set. */
export const priceUpdateBody = (id: string, f: PriceFormData) => ({
  id,
  price: f.price,
  productVariantId: f.productVariantId,
  supplierId: f.supplierId,
  ...(f.scheduledAt ? { scheduledAt: f.scheduledAt } : {}),
  ...(f.scheduledPrice !== null && f.scheduledAt ? { scheduledPrice: f.scheduledPrice } : {}),
});

/** The "Scheduled Price" cell: the price, or "--" when none is set. */
export const scheduledPriceText = (p: Pick<PriceItem, 'scheduledPrice'>, currency: string) => (p.scheduledPrice ? `${currency}${p.scheduledPrice}` : '--');
