/**
 * The Modifier page of the kh-pos web app: option groups (Extra cheese +0.5, Large size +1 ...) with
 * a title, a description and options that each have a name and an additional price; and the products
 * a modifier applies to.
 */

const n = (v: unknown) => Number(v) || 0;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const cents = (v: number) => Math.round(v * 100) / 100;

export interface ModifierItemRow {
  id: string;
  name: string;
  price: number | string;
}

export interface ModifierItem {
  modifierId: string;
  title: string;
  description?: string | null;
  createdAt?: string | null;
  createdBy?: { fullname?: string | null; username?: string | null } | null;
  items?: ModifierItemRow[];
}

export interface OptionForm {
  /** The option's id when it already exists; a new one has none yet. */
  id: string;
  name: string;
  price: number;
}

export interface ModifierFormData {
  title: string;
  description: string;
  items: OptionForm[];
}

export const emptyModifierForm = (): ModifierFormData => ({ title: '', description: '', items: [] });

export const modifierFormOf = (m: ModifierItem): ModifierFormData => ({
  title: m.title,
  description: text(m.description),
  items: (m.items ?? []).map((i) => ({ id: i.id, name: i.name, price: n(i.price) })),
});

export const addOption = (f: ModifierFormData): ModifierFormData => ({ ...f, items: [...f.items, { id: '', name: '', price: 0 }] });
export const patchOption = (f: ModifierFormData, index: number, patch: Partial<OptionForm>): ModifierFormData => ({ ...f, items: f.items.map((o, i) => (i === index ? { ...o, ...patch } : o)) });

/** The web only offers Remove while there is more than one option. */
export const canRemoveOption = (f: ModifierFormData) => f.items.length > 1;
export const removeOption = (f: ModifierFormData, index: number): ModifierFormData => (canRemoveOption(f) ? { ...f, items: f.items.filter((_, i) => i !== index) } : f);

/** A price is never negative (the web ignores a negative entry). */
export const cleanPrice = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(v) && v >= 0 ? v : 0);

export interface ModifierSummary {
  count: number;
  /** The most the options add together, as the web's "+x max" badge shows. */
  total: number;
}

export function summary(f: ModifierFormData): ModifierSummary {
  return { count: f.items.length, total: cents(f.items.reduce((s, i) => s + n(i.price), 0)) };
}

export type ModifierProblem = 'title' | 'noOptions' | 'optionName';

/** The web enables Save only with a title, at least one option, and every option named. */
export function modifierProblem(f: ModifierFormData): ModifierProblem | null {
  if (!f.title.trim()) return 'title';
  if (f.items.length === 0) return 'noOptions';
  if (f.items.some((i) => !i.name.trim())) return 'optionName';
  return null;
}

/**
 * The body kh-pos wants. kh-pos replaces a modifier's options on update and keeps only those that
 * arrive with an id (an option without one is dropped), so every option is sent with one: its own
 * when it has one, otherwise a new one made here.
 */
export function modifierSaveBody(f: ModifierFormData, newId: () => string, existing?: ModifierItem) {
  return {
    ...(existing ? { id: existing.modifierId } : {}),
    title: f.title.trim(),
    description: f.description,
    items: f.items.map((i) => ({ id: i.id || newId(), name: i.name.trim(), price: cleanPrice(i.price) })),
  };
}

/** Search by title or option name. */
export function matchesModifier(m: ModifierItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || m.title.toLowerCase().includes(q) || text(m.description).toLowerCase().includes(q) || (m.items ?? []).some((i) => i.name.toLowerCase().includes(q));
}

// ---- the products a modifier applies to ----

export interface BoundProduct {
  product_id: string;
  product?: { id?: string; title?: string | null; deletedAt?: string | null } | null;
  images?: { url: string }[];
  variants?: { id: string; name: string; price: number | null }[];
}

/** Products whose modifier binding still counts: not deleted, sorted by title (the server does the same). */
export const boundProducts = (rows: BoundProduct[]) => rows.filter((r) => r.product && !r.product.deletedAt).sort((a, b) => (a.product?.title ?? '').localeCompare(b.product?.title ?? ''));

/** Filter the applied products by every typed word, over title, variant names and so on. */
export function filterBound(rows: BoundProduct[], query: string): BoundProduct[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => {
    const hay = [r.product?.title, ...(r.variants ?? []).map((v) => v.name)].map((s) => String(s ?? '').toLowerCase()).join(' ');
    return words.every((w) => hay.includes(w));
  });
}

export const bindBody = (productId: string) => ({ productId });
