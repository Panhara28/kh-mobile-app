/**
 * The product form of the kh-pos web app (Add / Edit product), field for field: title, supplier,
 * category, description, For Sale and Track Stock; pictures (bound to variants); options and the
 * variants generated from them (price, discount, barcode, low and ideal stock, purchase cost,
 * composite components, visibility, menu tags, kitchen printer); unit conversions; and the movie
 * form for the cinema category. Mirrors src/components/gui/product/* and src/app/api/product-v2/*.
 */

const num = (v: unknown) => Number(v) || 0;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export const MOVIE_CATEGORY_ID = 'movies-category-id';
export const MAX_IMAGES_PER_VARIANT = 2;
export const MAX_OPTIONS = 3;
export const MOVIE_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
export const MOVIE_GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'Western'];

// ---- what kh-pos sends (GET /api/product-v2/{id}) ----

export interface DetailOption {
  id: string;
  name: string;
  values: { id: string; value: string }[];
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
  available?: boolean;
  isDefault?: boolean;
  isComposite?: boolean;
  compositeVariants?: { id?: string; qty: number; componentVariant: { id: string; name?: string | null; basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null } }[];
  visible?: boolean;
  isPopular?: boolean;
  isNew?: boolean;
  isMostOrder?: boolean;
  printerId?: string | null;
}

export interface MovieData {
  variantId: string;
  durationMinutes: number;
  rating: string;
  genre: string[];
  releaseDate: string;
  posterUrl?: string | null;
  trailerUrl?: string | null;
  director?: string | null;
  cast?: string[];
  synopsis?: string | null;
  emailProducer?: string[];
  producerShare?: number;
  taxRate?: number;
}

export interface Detail {
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
  options: DetailOption[];
  variants: DetailVariant[];
  conversions: { fromVariant: { id: string } | null; toVariant: { id: string } | null; productId?: string; conversionRate: number }[];
  movies?: MovieData | null;
}

// ---- the form ----

export interface OptionValueForm {
  id: string;
  value: string;
  /** A value of an existing product: kept, it cannot be removed (its variants exist). */
  locked?: boolean;
}

export interface OptionForm {
  id: string;
  name: string;
  values: OptionValueForm[];
}

export interface CompositeItem {
  id?: string;
  variantId: string;
  quantity: number;
  title?: string;
  image?: string;
}

export interface VariantForm {
  id: string;
  name: string;
  barcode: string;
  price: number;
  purchasedCost: number;
  lowStockQty: number | null;
  idealStockQty: number | null;
  discountType: '' | 'AMOUNT' | 'PERCENTAGE';
  discountValue: number | null;
  available: boolean;
  isDefault: boolean;
  optionValues: { id: string; value: string }[];
  isComposite: boolean;
  compositeVariants: CompositeItem[];
  visible: boolean;
  isPopular: boolean;
  isNew: boolean;
  isMostOrder: boolean;
  /** Kitchen printer of this branch; null = the category's printer. */
  printerId: string | null;
}

export interface ImageForm {
  id: string;
  url: string;
  productVariantId: string;
}

export interface ConversionForm {
  fromVariantId: string;
  toVariantId: string;
  conversionRate: number;
}

export interface ProductFormData {
  /** The product's id; for a new product it is made on the phone. */
  productId: string;
  isNewProduct: boolean;
  title: string;
  description: string;
  supplierId: string;
  categoryId: string;
  /** The product's category row as loaded (its id is sent back when the category is unchanged). */
  categoryRow: { id: string; categoryId: string } | null;
  isForSale: boolean;
  trackStock: boolean;
  /** Fields the web form does not show; kept as they were. */
  weight: number;
  length: number;
  width: number;
  height: number;
  isComposite: boolean;
  useProduction: boolean;
  images: ImageForm[];
  options: OptionForm[];
  variants: VariantForm[];
  conversions: ConversionForm[];
  movie: MovieData | null;
}

export function newVariant(newId: () => string, optionValues: { id: string; value: string }[], name: string, isDefault = false): VariantForm {
  return {
    id: newId(),
    name,
    barcode: '',
    price: 0,
    purchasedCost: 0,
    lowStockQty: null,
    idealStockQty: null,
    discountType: '',
    discountValue: null,
    available: true,
    isDefault,
    optionValues,
    isComposite: false,
    compositeVariants: [],
    visible: true,
    isPopular: false,
    isNew: false,
    isMostOrder: false,
    printerId: null,
  };
}

/** A new product starts like the web: option "default" with the single value "ns" and one default variant. */
export function newProductForm(newId: () => string): ProductFormData {
  const value = { id: newId(), value: 'ns' };
  return {
    productId: newId(),
    isNewProduct: true,
    title: '',
    description: '',
    supplierId: '',
    categoryId: '',
    categoryRow: null,
    isForSale: false,
    trackStock: false,
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    isComposite: false,
    useProduction: false,
    images: [],
    options: [{ id: newId(), name: 'default', values: [value] }],
    variants: [newVariant(newId, [value], 'ns', true)],
    conversions: [],
    movie: null,
  };
}

export function formFromDetail(d: Detail): ProductFormData {
  return {
    productId: d.basic.id ?? '',
    isNewProduct: false,
    title: d.basic.title || '',
    description: text(d.basic.description),
    supplierId: text(d.basic.supplierId),
    categoryId: d.categories[0]?.categoryId ?? '',
    categoryRow: d.categories[0]?.id ? { id: d.categories[0].id, categoryId: d.categories[0].categoryId } : null,
    isForSale: !!d.basic.isForSale,
    trackStock: !!d.basic.trackStock,
    weight: num(d.basic.weight),
    length: num(d.basic.length),
    width: num(d.basic.width),
    height: num(d.basic.height),
    isComposite: !!d.basic.isComposite,
    useProduction: !!d.basic.useProduction,
    images: [...d.images].sort((a, b) => a.imageOrder - b.imageOrder).map((i) => ({ id: i.id ?? '', url: i.url, productVariantId: i.productVariantId ?? '' })),
    options: d.options.map((o) => ({ id: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, value: v.value, locked: true })) })),
    variants: d.variants.map((v) => ({
      id: v.id,
      name: v.name,
      barcode: text(v.barcode),
      price: num(v.price),
      purchasedCost: num(v.purchasePrice),
      lowStockQty: v.lowStockQty ?? null,
      idealStockQty: v.idealStockQty ?? null,
      discountType: v.discountType ?? '',
      discountValue: v.discountValue ?? null,
      available: v.available !== false,
      isDefault: !!v.isDefault,
      optionValues: v.optionValues.map((o) => ({ id: o.id, value: o.value })),
      isComposite: !!v.isComposite,
      compositeVariants: (v.compositeVariants ?? []).map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        variantId: c.componentVariant.id,
        quantity: c.qty,
        title: `${c.componentVariant.basicProduct?.title ?? ''} (${c.componentVariant.name ?? ''})`,
        image: c.componentVariant.basicProduct?.images?.find((img) => img.productVariantId === c.componentVariant.id)?.url,
      })),
      visible: v.visible !== false,
      isPopular: !!v.isPopular,
      isNew: !!v.isNew,
      isMostOrder: !!v.isMostOrder,
      printerId: v.printerId ?? null,
    })),
    conversions: d.conversions.filter((c) => c.fromVariant && c.toVariant).map((c) => ({ fromVariantId: c.fromVariant!.id, toVariantId: c.toVariant!.id, conversionRate: c.conversionRate })),
    movie: d.movies ?? null,
  };
}

export const isMovie = (f: Pick<ProductFormData, 'categoryId'>) => f.categoryId === MOVIE_CATEGORY_ID;

// ---- options and variants ----

/** Every combination of the options' values, named "A / B" (kh-pos generate-variant does the same). */
export function generateVariants(options: OptionForm[]): { name: string; optionValues: { id: string; value: string }[] }[] {
  const usable = options.filter((o) => o.values.length > 0);
  const out: { name: string; optionValues: { id: string; value: string }[] }[] = [];
  const walk = (i: number, name: string, values: { id: string; value: string }[]) => {
    if (i === usable.length) {
      out.push({ name, optionValues: values });
      return;
    }
    for (const v of usable[i]!.values) walk(i + 1, name ? `${name} / ${v.value}` : v.value, [...values, { id: v.id, value: v.value }]);
  };
  if (usable.length > 0) walk(0, '', []);
  return out;
}

const compact = (name: string) => name.split('/').map((n) => n.trim()).join('');
const compactReversed = (name: string) => name.split('/').map((n) => n.trim()).reverse().join('');

/** The existing variant a generated one stands for: same name, or the same parts in reverse order. */
export function matchVariant(generatedName: string, existing: VariantForm[]): VariantForm | undefined {
  const g = compact(generatedName);
  return existing.find((f) => g === compact(f.name) || g === compactReversed(f.name));
}

export interface OptionProblem {
  index: number;
  kind: 'name' | 'duplicate' | 'values';
}

export function optionProblems(options: OptionForm[]): OptionProblem[] {
  const out: OptionProblem[] = [];
  options.forEach((o, index) => {
    if (!o.name.trim()) out.push({ index, kind: 'name' });
    else if (options.filter((x) => x.name.trim() === o.name.trim()).length > 1) out.push({ index, kind: 'duplicate' });
    if (o.values.length === 0) out.push({ index, kind: 'values' });
  });
  return out;
}

/** Generate is allowed when at least one option has a name and a value (as on the web). */
export const canGenerate = (options: OptionForm[]) => options.some((o) => o.name.trim() && o.values.length > 0);

/**
 * Applies the options dialog: the options replace the old ones and the variants are generated again,
 * keeping price, barcode, cost and default of a variant that still exists (and everything else the
 * form had about it), starting the new ones at the category's kitchen printer.
 */
export function applyOptions(f: ProductFormData, options: OptionForm[], newId: () => string, categoryPrinterId: string | null): ProductFormData {
  const clean = options.filter((o) => o.values.length > 0).map((o) => ({ id: o.id || newId(), name: o.name.trim(), values: o.values.map((v) => ({ id: v.id || newId(), value: v.value, ...(v.locked ? { locked: true } : {}) })) }));
  const generated = generateVariants(clean);
  const variants = generated.map((g, i) => {
    const old = matchVariant(g.name, f.variants);
    if (old) return { ...old, name: g.name, optionValues: g.optionValues };
    const v = newVariant(newId, g.optionValues, g.name, false);
    v.printerId = categoryPrinterId;
    return v;
  });
  if (variants.length > 0 && !variants.some((v) => v.isDefault)) variants[0]!.isDefault = true;
  const ids = new Set(variants.map((v) => v.id));
  return {
    ...f,
    options: clean,
    variants,
    images: f.images.map((im) => (im.productVariantId && !ids.has(im.productVariantId) ? { ...im, productVariantId: '' } : im)),
    conversions: f.conversions.filter((c) => ids.has(c.fromVariantId) && ids.has(c.toVariantId)),
  };
}

export const setAllPrices = (f: ProductFormData, price: number): ProductFormData => ({ ...f, variants: f.variants.map((v) => ({ ...v, price })) });

export function patchVariant(f: ProductFormData, index: number, patch: Partial<VariantForm>): ProductFormData {
  return { ...f, variants: f.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) };
}

/** A discount type switched off clears its value, like the web. */
export function setDiscountType(f: ProductFormData, index: number, type: '' | 'AMOUNT' | 'PERCENTAGE'): ProductFormData {
  return patchVariant(f, index, type ? { discountType: type } : { discountType: '', discountValue: null });
}

export function removeVariant(f: ProductFormData, index: number): ProductFormData {
  const gone = f.variants[index]?.id;
  return {
    ...f,
    variants: f.variants.filter((_, i) => i !== index),
    images: f.images.map((im) => (im.productVariantId === gone ? { ...im, productVariantId: '' } : im)),
    conversions: f.conversions.filter((c) => c.fromVariantId !== gone && c.toVariantId !== gone),
  };
}

/** Choosing a category gives every variant that category's kitchen printer (each can still be changed). */
export function setCategory(f: ProductFormData, categoryId: string, printerId: string | null | undefined): ProductFormData {
  return { ...f, categoryId, variants: categoryId ? f.variants.map((v) => ({ ...v, printerId: printerId ?? null })) : f.variants };
}

// ---- composite components ----

export function setComponent(f: ProductFormData, variantIndex: number, item: CompositeItem): ProductFormData {
  const v = f.variants[variantIndex];
  if (!v) return f;
  const at = v.compositeVariants.findIndex((c) => c.variantId === item.variantId);
  const list = at < 0 ? [...v.compositeVariants, { ...item, quantity: Math.max(1, Math.floor(item.quantity)) }] : v.compositeVariants.map((c, i) => (i === at ? { ...c, quantity: Math.max(1, Math.floor(item.quantity)) } : c));
  return patchVariant(f, variantIndex, { compositeVariants: list });
}

export function removeComponent(f: ProductFormData, variantIndex: number, componentIndex: number): ProductFormData {
  const v = f.variants[variantIndex];
  return v ? patchVariant(f, variantIndex, { compositeVariants: v.compositeVariants.filter((_, i) => i !== componentIndex) }) : f;
}

// ---- pictures ----

export function addImages(f: ProductFormData, urls: string[], newId: () => string): ProductFormData {
  return { ...f, images: [...f.images, ...urls.map((url) => ({ id: newId(), url, productVariantId: '' }))] };
}

export const removeImage = (f: ProductFormData, index: number): ProductFormData => ({ ...f, images: f.images.filter((_, i) => i !== index) });
export const unbindImage = (f: ProductFormData, index: number): ProductFormData => ({ ...f, images: f.images.map((im, i) => (i === index ? { ...im, productVariantId: '' } : im)) });

/** Tapping a picture for a variant: unbinds it if it is bound to that variant, binds it if free and the variant has fewer than 2. */
export function toggleBind(f: ProductFormData, imageId: string, variantId: string): ProductFormData {
  const at = f.images.findIndex((im) => im.id === imageId);
  if (at < 0) return f;
  const image = f.images[at]!;
  if (image.productVariantId === variantId) return unbindImage(f, at);
  if (image.productVariantId) return f; // bound to another variant
  const bound = f.images.filter((im) => im.productVariantId === variantId).length;
  if (bound >= MAX_IMAGES_PER_VARIANT) return f;
  return { ...f, images: f.images.map((im, i) => (i === at ? { ...im, productVariantId: variantId } : im)) };
}

export const imagesFor = (f: ProductFormData, variantId: string) => f.images.filter((im) => im.productVariantId === variantId);
export const bindable = (f: ProductFormData, variantId: string) => f.images.filter((im) => im.productVariantId === variantId || !im.productVariantId);

// ---- conversions ----

const pairKey = (a: string, b: string) => `${a}-${b}`;

/** Pairs already used, in both directions (a conversion and its reverse count as one). */
function usedPairs(conversions: ConversionForm[]): Set<string> {
  const s = new Set<string>();
  for (const c of conversions) if (c.fromVariantId && c.toVariantId) {
    s.add(pairKey(c.fromVariantId, c.toVariantId));
    s.add(pairKey(c.toVariantId, c.fromVariantId));
  }
  return s;
}

/** Conversions need at least two variants with names. */
export const conversionsAvailable = (f: ProductFormData) => f.variants.filter((v) => v.name.trim()).length >= 2;

/** How many more conversions can still be added. */
export function conversionsLeft(f: ProductFormData): number {
  const n = f.variants.filter((v) => v.name.trim()).length;
  return n * (n - 1) - usedPairs(f.conversions).size;
}

export const addConversion = (f: ProductFormData): ProductFormData => ({ ...f, conversions: [...f.conversions, { fromVariantId: '', toVariantId: '', conversionRate: 2 }] });
export const removeConversion = (f: ProductFormData, index: number): ProductFormData => ({ ...f, conversions: f.conversions.filter((_, i) => i !== index) });

export function patchConversion(f: ProductFormData, index: number, patch: Partial<ConversionForm>): ProductFormData {
  return { ...f, conversions: f.conversions.map((c, i) => (i === index ? { ...c, ...patch } : c)) };
}

/** Variants that can be the "from" of a conversion row (at least one free partner remains). */
export function fromChoices(f: ProductFormData, index: number): VariantForm[] {
  const used = usedPairs(f.conversions);
  const current = f.conversions[index];
  const named = f.variants.filter((v) => v.name.trim());
  return named.filter((v) => named.some((to) => to.id !== v.id && (!used.has(pairKey(v.id, to.id)) || (v.id === current?.fromVariantId && to.id === current?.toVariantId))));
}

/** Variants that can be the "to" once "from" is chosen. */
export function toChoices(f: ProductFormData, index: number): VariantForm[] {
  const current = f.conversions[index];
  if (!current?.fromVariantId) return [];
  const used = usedPairs(f.conversions);
  return f.variants.filter((v) => v.name.trim() && v.id !== current.fromVariantId && (!used.has(pairKey(current.fromVariantId, v.id)) || v.id === current.toVariantId));
}

export const conversionComplete = (c: ConversionForm) => !!c.fromVariantId && !!c.toVariantId && c.fromVariantId !== c.toVariantId && c.conversionRate >= 2;

// ---- movie ----

export function defaultMovie(f: ProductFormData, today: string): MovieData {
  return { variantId: f.variants[0]?.id ?? '', durationMinutes: 0, rating: 'G', genre: [], releaseDate: today, posterUrl: f.images[0]?.url ?? null, trailerUrl: null, director: null, cast: [], emailProducer: [], synopsis: f.description || null, producerShare: 0, taxRate: 0 };
}

// ---- checking ----

export type ProductProblem =
  | { field: 'title' }
  | { field: 'variants' }
  | { field: 'variantName'; index: number }
  | { field: 'duplicateVariant'; index: number }
  | { field: 'price'; index: number }
  | { field: 'cost'; index: number }
  | { field: 'discount'; index: number }
  | { field: 'stock'; index: number }
  | { field: 'composite'; index: number }
  | { field: 'movieVariants' }
  | { field: 'movieDuration' }
  | { field: 'moviePercent' }
  | { field: 'conversion'; index: number };

/** The first thing wrong, in the order the web (and then the API) would complain; null when it can be saved. */
export function validateProduct(f: ProductFormData): ProductProblem | null {
  if (!f.title.trim()) return { field: 'title' };
  if (f.variants.length === 0) return { field: 'variants' };
  if (isMovie(f) && f.variants.length > 1) return { field: 'movieVariants' };
  const seen = new Set<string>();
  for (const [index, v] of f.variants.entries()) {
    if (!v.name.trim()) return { field: 'variantName', index };
    const key = v.name.trim().toLowerCase();
    if (seen.has(key)) return { field: 'duplicateVariant', index };
    seen.add(key);
    if (v.price < 0) return { field: 'price', index };
    if (v.purchasedCost < 0) return { field: 'cost', index };
    if (v.lowStockQty !== null && v.lowStockQty < 0) return { field: 'stock', index };
    if (v.idealStockQty !== null && v.idealStockQty < 0) return { field: 'stock', index };
    if (v.discountType && !(num(v.discountValue) > 0)) return { field: 'discount', index };
    if (v.discountType === 'PERCENTAGE' && num(v.discountValue) > 100) return { field: 'discount', index };
    if (v.isComposite && v.compositeVariants.length === 0) return { field: 'composite', index };
  }
  for (const [index, c] of f.conversions.entries()) if (!conversionComplete(c)) return { field: 'conversion', index };
  if (isMovie(f) && f.movie) {
    if (!(num(f.movie.durationMinutes) > 0)) return { field: 'movieDuration' };
    if (num(f.movie.producerShare) < 0 || num(f.movie.producerShare) > 100) return { field: 'moviePercent' };
  }
  return null;
}

// ---- the request bodies ----

const variantBody = (v: VariantForm) => ({
  id: v.id,
  name: v.name.trim(),
  barcode: v.barcode.trim() ? v.barcode.trim() : null,
  price: num(v.price),
  available: v.available,
  isDefault: v.isDefault,
  optionValues: v.optionValues.map((o) => ({ id: o.id, value: o.value })),
  lowStockQty: v.lowStockQty,
  idealStockQty: v.idealStockQty,
  purchasedCost: num(v.purchasedCost),
  discountType: v.discountType || null,
  discountValue: v.discountType ? num(v.discountValue) : null,
  isComposite: v.isComposite,
  compositeVariants: v.isComposite ? v.compositeVariants.map((c) => ({ ...(c.id ? { id: c.id } : {}), variantId: c.variantId, quantity: c.quantity })) : [],
  visible: v.visible,
  isPopular: v.isPopular,
  isNew: v.isNew,
  isMostOrder: v.isMostOrder,
  printerId: v.printerId,
});

const basicBody = (f: ProductFormData) => ({
  title: f.title.trim(),
  description: f.description,
  weight: f.weight,
  length: f.length,
  width: f.width,
  height: f.height,
  isComposite: f.isComposite,
  useProduction: f.useProduction,
  trackStock: f.trackStock,
  isForSale: f.isForSale,
  supplierId: f.supplierId || null,
});

function movieBody(f: ProductFormData): MovieData | undefined {
  if (!isMovie(f)) return undefined;
  const m = f.movie;
  if (!m) return undefined;
  return { ...m, variantId: f.variants[0]?.id ?? m.variantId };
}

const optionBody = (f: ProductFormData) => f.options.map((o) => ({ id: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, value: v.value })) }));
const conversionBody = (f: ProductFormData) => f.conversions.filter(conversionComplete).map((c) => ({ fromVariantId: c.fromVariantId, toVariantId: c.toVariantId, productId: f.productId, conversionRate: c.conversionRate }));

/** POST /api/product-v2 */
export function createBody(f: ProductFormData) {
  const movie = movieBody(f);
  return {
    productId: f.productId,
    productBasic: basicBody(f),
    productCategories: f.categoryId ? [{ categoryId: f.categoryId }] : [],
    productImages: f.images.map((im, i) => ({ id: im.id, url: im.url, imageOrder: i, productVariantId: im.productVariantId })),
    productOption: optionBody(f),
    productVariants: f.variants.map(variantBody),
    productConversions: conversionBody(f),
    ...(movie ? { productMovies: movie } : {}),
  };
}

/** PUT /api/product-v2 (kh-pos replaces options, variants, pictures and conversions with what is sent). */
export function updateBody(f: ProductFormData) {
  const movie = movieBody(f);
  return {
    productId: f.productId,
    productBasic: basicBody(f),
    productCategories: f.categoryId ? [f.categoryRow && f.categoryRow.categoryId === f.categoryId ? { id: f.categoryRow.id, categoryId: f.categoryId } : { categoryId: f.categoryId }] : [],
    productImages: f.images.map((im, i) => ({ url: im.url, id: im.id, imageOrder: i, productVariantId: im.productVariantId })),
    productOption: optionBody(f),
    productVariants: f.variants.map(variantBody),
    productConversions: conversionBody(f),
    ...(movie ? { productMovies: movie } : {}),
  };
}
