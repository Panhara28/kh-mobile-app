/**
 * The Category page of the kh-pos web app: a row per category (picture, title, description,
 * products for sale / all, printer, created, sort order, exclude delivery fee, extra fee) and a form
 * with picture, title, description, printer, sort order, "Exclude Fee Delivery" and "Extra Delivery
 * Fee"; plus enabling or disabling every product of a category for sale.
 */

const n = (v: unknown) => Number(v) || 0;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export interface CategoryItem {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  printerId?: string | null;
  sortOrder?: number | null;
  excludeFeeDelivery?: boolean | null;
  markExtraFee?: number | null;
  productCount?: number | null;
  forSaleCount?: number | null;
  createdAt?: string | null;
  printer?: { id?: string; name?: string | null; printerName?: string | null } | null;
}

export interface PrinterItem {
  id: string;
  name: string;
  printerName?: string | null;
}

export type CategoryFormData = {
  title: string;
  description: string;
  imageUrl: string;
  printerId: string;
  sortOrder: number;
  excludeFeeDelivery: boolean;
  markExtraFee: number;
};

export const emptyCategoryForm = (): CategoryFormData => ({ title: '', description: '', imageUrl: '', printerId: '', sortOrder: 0, excludeFeeDelivery: false, markExtraFee: 0 });

export const categoryFormOf = (c: CategoryItem): CategoryFormData => ({
  title: c.title,
  description: text(c.description),
  imageUrl: text(c.imageUrl),
  printerId: text(c.printerId ?? c.printer?.id),
  sortOrder: n(c.sortOrder),
  excludeFeeDelivery: !!c.excludeFeeDelivery,
  markExtraFee: n(c.markExtraFee),
});

/** A category needs a title (the web disables Save without one). */
export const categoryProblem = (f: CategoryFormData): 'title' | null => (f.title.trim() ? null : 'title');

/**
 * The body kh-pos wants. The parent is not in the web form, so an existing category keeps its
 * parent as it was; a new one has none.
 */
export function saveBody(f: CategoryFormData, existing?: CategoryItem) {
  return {
    ...(existing ? { id: existing.id } : {}),
    title: f.title.trim(),
    description: f.description,
    imageUrl: f.imageUrl || null,
    parentId: existing?.parentId ?? null,
    printerId: f.printerId || null,
    sortOrder: Math.floor(n(f.sortOrder)),
    excludeFeeDelivery: f.excludeFeeDelivery,
    markExtraFee: n(f.markExtraFee),
  };
}

/** Only the main branch adds categories, and deletes them (with delete permission); every branch may set its own printer. */
export const canAddCategory = (isMain: boolean, allowed: boolean) => isMain && allowed;
export const canDeleteCategory = (isMain: boolean, allowed: boolean) => isMain && allowed;
/** In a branch that is not the main one the title, description, picture and sort order are read-only (the printer is not). */
export const isReadOnlyField = (isMain: boolean, field: 'title' | 'description' | 'image' | 'sortOrder') => !isMain && ['title', 'description', 'image', 'sortOrder'].includes(field);

/** How the "for sale / all products" count is coloured: all for sale = good, none = bad, some = warning. */
export function saleTone(c: Pick<CategoryItem, 'forSaleCount' | 'productCount'>): 'success' | 'destructive' | 'warning' {
  const sale = n(c.forSaleCount);
  if (sale === n(c.productCount)) return 'success';
  if (sale === 0) return 'destructive';
  return 'warning';
}

export const saleText = (c: Pick<CategoryItem, 'forSaleCount' | 'productCount'>) => `${n(c.forSaleCount)}/${n(c.productCount)}`;

/** Search by title or description, like the server does. */
export function matches(c: Pick<CategoryItem, 'title' | 'description'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || c.title.toLowerCase().includes(q) || text(c.description).toLowerCase().includes(q);
}

export type SaleStatus = 'enable' | 'disable';
export const toggleBody = (categoryId: string, status: SaleStatus) => ({ categoryIds: [categoryId], status });

/** "Initials" shown when a category has no picture. */
export const initials = (title: string) => title.split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase()).join('').slice(0, 3);

export const printerLabel = (p: PrinterItem) => (p.printerName ? `${p.name} (${p.printerName})` : p.name);
