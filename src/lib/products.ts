/**
 * Products like the kh-pos web product form, reduced to what is edited on a phone: name,
 * description, categories, pictures, sale flags and the variants' name, price, cost, barcode and
 * badges. kh-pos replaces a product's options, variants, pictures and conversions with whatever
 * is sent (anything left out is deleted), so an edit always sends the whole product back with
 * only the edited fields changed.
 */

const num = (v: unknown) => Number(v) || 0;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

// ---- what kh-pos sends ----

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

export interface DetailVariant {
  id: string;
  name: string;
  barcode?: string | null;
  price: number | null;
  purchasePrice?: number | null;
  lowStockQty?: number | null;
  idealStockQty?: number | null;
  discountType?: 'AMOUNT' | 'PERCENTAGE' | null;
  discountValue?: number | null;
  optionValues: { id: string; value: string }[];
  isComposite?: boolean;
  compositeVariants?: { id?: string; variantId: string; quantity: number }[];
  visible?: boolean;
  isPopular?: boolean;
  isNew?: boolean;
  isMostOrder?: boolean;
  printerId?: string | null;
}

export interface ProductDetail {
  basic: {
    id?: string;
    title: string;
    description?: string | null;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    isComposite?: boolean | null;
    useProduction?: boolean | null;
    trackStock?: boolean | null;
    isForSale?: boolean | null;
    supplierId?: string | null;
  };
  images: { id?: string; url: string; imageOrder: number; productVariantId?: string | null }[];
  categories: { id?: string; categoryId: string; title?: string | null }[];
  options: { id: string; name: string; values: { id: string; value: string }[] }[];
  variants: DetailVariant[];
  conversions: { fromVariant: { id: string } | null; toVariant: { id: string } | null; productId: string; conversionRate: number }[];
}

// ---- the form ----

export interface VariantForm {
  id: string;
  name: string;
  barcode: string;
  price: number;
  purchasedCost: number;
  visible: boolean;
  isPopular: boolean;
  isNew: boolean;
  isMostOrder: boolean;
  discountType: '' | 'AMOUNT' | 'PERCENTAGE';
  discountValue: number;
  /** The option value this variant stands for (its name, for single-option products). */
  optionValueId: string;
}

export interface ProductForm {
  title: string;
  description: string;
  isForSale: boolean;
  trackStock: boolean;
  categoryIds: string[];
  variants: VariantForm[];
  /** Picture addresses, in order (the first is the one the menu shows). */
  images: string[];
}

/** kh-pos' own default for a simple product: one option "default" with one value "ns" ("no size"). */
export const DEFAULT_VARIANT_NAME = 'ns';

export function newVariant(newId: () => string, name = DEFAULT_VARIANT_NAME): VariantForm {
  return { id: newId(), name, barcode: '', price: 0, purchasedCost: 0, visible: true, isPopular: false, isNew: false, isMostOrder: false, discountType: '', discountValue: 0, optionValueId: newId() };
}

export const emptyProductForm = (newId: () => string): ProductForm => ({ title: '', description: '', isForSale: true, trackStock: false, categoryIds: [], variants: [newVariant(newId)], images: [] });

export function formFromDetail(d: ProductDetail): ProductForm {
  const single = d.options.length === 1;
  return {
    title: d.basic.title,
    description: text(d.basic.description),
    isForSale: !!d.basic.isForSale,
    trackStock: !!d.basic.trackStock,
    categoryIds: d.categories.map((c) => c.categoryId),
    variants: d.variants.map((v) => ({
      id: v.id,
      name: v.name,
      barcode: text(v.barcode),
      price: num(v.price),
      purchasedCost: num(v.purchasePrice),
      visible: v.visible !== false,
      isPopular: !!v.isPopular,
      isNew: !!v.isNew,
      isMostOrder: !!v.isMostOrder,
      discountType: v.discountType ?? '',
      discountValue: num(v.discountValue),
      optionValueId: single ? (v.optionValues[0]?.id ?? '') : '',
    })),
    images: [...d.images].sort((a, b) => a.imageOrder - b.imageOrder).map((i) => i.url),
  };
}

/** Whether variants can be added, removed and renamed: only for products with a single option. */
export const canEditStructure = (d: ProductDetail | null) => d === null || d.options.length === 1;

export function validateProduct(f: ProductForm): string | null {
  if (!f.title.trim()) return 'title';
  if (f.variants.length === 0) return 'variants';
  for (const v of f.variants) {
    if (!v.name.trim()) return 'variantName';
    if (v.price < 0) return 'price';
    if (v.purchasedCost < 0) return 'cost';
    if (v.discountType && !(v.discountValue > 0)) return 'discount';
    if (v.discountType === 'PERCENTAGE' && v.discountValue > 100) return 'discount';
  }
  const names = f.variants.map((v) => v.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'duplicateVariant';
  return null;
}

/**
 * The whole product as kh-pos wants it. Fields the form doesn't edit (size, supplier, stock
 * levels, composites, kitchen printer, conversions, other options) are taken from `detail`.
 */
export function productBody(f: ProductForm, detail: ProductDetail | null, newId: () => string) {
  const productId = detail?.basic.id ?? newId();
  const old = new Map((detail?.variants ?? []).map((v) => [v.id, v]));
  const structure = canEditStructure(detail);

  // Options: a single option's values follow the variants' names; several options stay as they were.
  let options = detail?.options ?? [];
  if (structure) {
    const values = f.variants.map((v) => ({ id: v.optionValueId || newId(), value: v.name.trim() }));
    options = [{ id: options[0]?.id ?? newId(), name: options[0]?.name ?? (f.variants.length > 1 ? 'size' : 'default'), values }];
  }
  const valueOf = (i: number) => options[0]?.values[i];

  const variants = f.variants.map((v, i) => {
    const o = old.get(v.id);
    return {
      id: v.id,
      name: structure ? v.name.trim() : (o?.name ?? v.name.trim()),
      barcode: v.barcode.trim() || null,
      price: v.price,
      available: true,
      isDefault: i === 0,
      optionValues: structure ? [{ id: valueOf(i)!.id, value: valueOf(i)!.value }] : (o?.optionValues ?? []),
      lowStockQty: o?.lowStockQty ?? null,
      idealStockQty: o?.idealStockQty ?? null,
      purchasedCost: v.purchasedCost,
      discountType: v.discountType || null,
      discountValue: v.discountType ? v.discountValue : null,
      isComposite: !!o?.isComposite,
      compositeVariants: (o?.compositeVariants ?? []).map((c) => ({ ...(c.id ? { id: c.id } : {}), variantId: c.variantId, quantity: c.quantity })),
      visible: v.visible,
      isPopular: v.isPopular,
      isNew: v.isNew,
      isMostOrder: v.isMostOrder,
      ...(o && o.printerId !== undefined ? { printerId: o.printerId } : {}),
    };
  });

  const oldImages = new Map((detail?.images ?? []).map((i) => [i.url, i]));
  const b = detail?.basic;
  return {
    productId,
    productBasic: {
      title: f.title.trim(),
      description: f.description.trim(),
      weight: num(b?.weight),
      length: num(b?.length),
      width: num(b?.width),
      height: num(b?.height),
      isComposite: !!b?.isComposite,
      useProduction: !!b?.useProduction,
      trackStock: f.trackStock,
      isForSale: f.isForSale,
      supplierId: b?.supplierId ?? null,
    },
    productCategories: f.categoryIds.map((categoryId) => {
      const had = detail?.categories.find((c) => c.categoryId === categoryId);
      return had?.id ? { id: had.id, categoryId } : { categoryId };
    }),
    productImages: f.images.map((url, i) => {
      const had = oldImages.get(url);
      return { ...(had?.id ? { id: had.id } : {}), url, imageOrder: i, ...(had?.productVariantId ? { productVariantId: had.productVariantId } : {}) };
    }),
    productOption: options,
    productVariants: variants,
    // sending none would delete the product's conversions
    productConversions: (detail?.conversions ?? [])
      .filter((c) => c.fromVariant && c.toVariant)
      .map((c) => ({ fromVariantId: c.fromVariant!.id, toVariantId: c.toVariant!.id, productId: c.productId, conversionRate: c.conversionRate })),
  };
}

/** "Fried rice (Large)" style summary of a product's price(s) for the list. */
export function priceRange(variants: { price: number | null }[] | undefined): { min: number; max: number } | null {
  const prices = (variants ?? []).map((v) => num(v.price));
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
