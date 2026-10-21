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

// ---- discounts ----

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

