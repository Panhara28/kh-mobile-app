import type { Category, MenuProduct } from './api';

/** kh-pos menu rows are titled "Product (Variant)". */
export function splitTitle(productTitle: string): { name: string; variant: string | null } {
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(productTitle.trim());
  if (!m) return { name: productTitle.trim(), variant: null };
  return { name: m[1]!, variant: m[2]!.trim() || null };
}

/**
 * Price to show, like the web menu card: the variant's discounted price when there is one,
 * with the original price struck through.
 */
export function cardPrice(p: Pick<MenuProduct, 'price' | 'discountedPrice'>): { price: number; original: number | null } {
  const base = Number(p.price ?? 0) || 0;
  const discounted = p.discountedPrice == null ? null : Number(p.discountedPrice);
  if (discounted != null && Number.isFinite(discounted) && discounted < base) return { price: discounted, original: base };
  return { price: base, original: null };
}

/** Categories worth a chip: the ones with something for sale (the web hides empty ones too). */
export function menuCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.forSaleCount === undefined || c.forSaleCount > 0);
}

/** Up to two initials for products without a photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
