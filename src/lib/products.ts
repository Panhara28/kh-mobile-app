/**
 * The product list like the kh-pos web Product page. The add/edit form lives in product-form.ts.
 */

const num = (v: unknown) => Number(v) || 0;

// ---- what kh-pos sends for the list ----

export interface ProductListItem {
  id: string;
  title: string;
  description?: string | null;
  productImages?: { url: string; imageOrder?: number; productVariantId?: string | null }[];
  productCategories?: { categoryId: string; title?: string | null }[];
  productVariants?: { id: string; name: string; price: number | null; barcode?: string | null; visible?: boolean }[];
  isForSale?: boolean;
  trackStock?: boolean;
}

/** "Fried rice (Large)" style summary of a product's price(s) for the list. */
export function priceRange(variants: { price: number | null }[] | undefined): { min: number; max: number } | null {
  const prices = (variants ?? []).map((v) => num(v.price));
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
