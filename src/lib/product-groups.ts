/** Product groups like the kh-pos web page: a named set of product variants, shown in the chosen branches. */

export interface GroupRow {
  groupId: string;
  groupName: string;
  description?: string | null;
  createdBy?: { fullname?: string | null } | null;
  createdAt?: string | null;
  warehouses: { warehouseId: string; warehouse?: { name?: string | null } | null }[];
  products: { productId: string; productVariantId: string; product?: { title?: string | null } | null; variant?: { name?: string | null; sku?: string | number | null; barcode?: string | null } | null }[];
}

export type GroupForm = {
  name: string;
  description: string;
};

export const emptyGroup = (): GroupForm => ({ name: '', description: '' });
export const groupForm = (g: GroupRow): GroupForm => ({ name: g.groupName, description: g.description ?? '' });

export function validateGroup(f: GroupForm): keyof GroupForm | null {
  return f.name.trim() ? null : 'name';
}

/** Create and edit share a body; kh-pos wants the id on create and as groupId on edit. */
export const groupBody = (f: GroupForm, groupId: string) => ({ groupId, groupName: f.name.trim(), description: f.description.trim() || undefined });

/** "Product (Variant)" for one product of a group. */
export function productLabel(p: GroupRow['products'][number]): string {
  const title = p.product?.title ?? '';
  const variant = p.variant?.name && p.variant.name !== 'ns' ? p.variant.name : '';
  return [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?';
}

/** Branch ids to add and to remove so that the group ends up with exactly `wanted`. */
export function warehouseChanges(current: string[], wanted: string[]) {
  return { add: wanted.filter((w) => !current.includes(w)), remove: current.filter((w) => !wanted.includes(w)) };
}

export const assignBody = (items: { productId: string; variantId: string }[]) => items.map((i) => ({ productId: i.productId, productVariantId: i.variantId }));

/** Variants not already in the group. */
export const notInGroup = (group: Pick<GroupRow, 'products'>, variantId: string) => !group.products.some((p) => p.productVariantId === variantId);

export const GROUP_PAGE = 20;

/** The list query the web sends: 20 per page, optionally for one branch. */
export function groupListQuery(offset: number, warehouseId: string): string {
  const q = new URLSearchParams({ offset: String(offset), limit: String(GROUP_PAGE) });
  if (warehouseId) q.set('warehouseIds', warehouseId);
  return q.toString();
}

/** How the web form labels a product it already holds: title, (variant), (barcode). */
export function heldLabel(p: GroupRow['products'][number]): string {
  return [p.product?.title ?? String(p.variant?.sku ?? `${p.productId} / ${p.productVariantId}`), p.variant?.name && `(${p.variant.name})`, p.variant?.barcode && `(${p.variant.barcode})`].filter(Boolean).join(' ');
}

/** How the web form labels a product it just picked: title and (sku). */
export const pickedLabel = (title: string, sku?: string | number | null) => title + (sku ? ` (${sku})` : '');

export interface PickedProduct {
  productId: string;
  variantId: string;
  label: string;
}

export interface Step {
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body: unknown;
}

const VISIBILITY = '/api/product-v2/warehouse-visibilty';

const shown = (products: { productId: string; variantId: string }[], warehouseIds: string[]) => ({
  input: products.flatMap((p) => warehouseIds.map((w) => ({ warehouseId: w, productId: p.productId, productVariantId: p.variantId, isVisible: true, isForSale: true }))),
});
const hidden = (products: { productId: string; variantId: string }[], warehouseIds: string[]) => ({
  input: products.flatMap((p) => warehouseIds.map((w) => ({ warehouseId: w, productId: p.productId, productVariantId: p.variantId }))),
});

/**
 * The calls the web form makes, in its order. Creating: the group, its products, its branches, then
 * every product shown in every branch. Editing: the name, then products added (shown in all chosen
 * branches) or removed (hidden there), then branches added (all products shown there) or removed.
 */
export function saveSteps(input: { id: string; existing: GroupRow | null; form: GroupForm; products: PickedProduct[]; warehouseIds: string[] }): Step[] {
  const { id, existing, form, products, warehouseIds } = input;
  const base = `/api/product-v2/group/${encodeURIComponent(id)}`;
  const steps: Step[] = [];
  if (!existing) {
    steps.push({ method: 'POST', path: '/api/product-v2/group', body: groupBody(form, id) });
    if (products.length) steps.push({ method: 'POST', path: `${base}/products`, body: assignBody(products) });
    if (warehouseIds.length) steps.push({ method: 'POST', path: `${base}/warehouse`, body: { warehouseIds } });
    if (products.length && warehouseIds.length) steps.push({ method: 'POST', path: VISIBILITY, body: shown(products, warehouseIds) });
    return steps;
  }
  const had = new Set(existing.products.map((p) => p.productVariantId));
  const now = new Set(products.map((p) => p.variantId));
  const addP = products.filter((p) => !had.has(p.variantId));
  const dropP = existing.products.filter((p) => !now.has(p.productVariantId)).map((p) => ({ productId: p.productId, variantId: p.productVariantId }));
  const { add, remove } = warehouseChanges(existing.warehouses.map((w) => w.warehouseId), warehouseIds);
  steps.push({ method: 'PUT', path: '/api/product-v2/group', body: groupBody(form, id) });
  if (addP.length) {
    steps.push({ method: 'POST', path: `${base}/products`, body: assignBody(addP) });
    if (warehouseIds.length) steps.push({ method: 'POST', path: VISIBILITY, body: shown(addP, warehouseIds) });
  }
  if (dropP.length) {
    steps.push({ method: 'DELETE', path: `${base}/products`, body: assignBody(dropP) });
    if (warehouseIds.length) steps.push({ method: 'DELETE', path: VISIBILITY, body: hidden(dropP, warehouseIds) });
  }
  if (add.length) {
    steps.push({ method: 'POST', path: `${base}/warehouse`, body: { warehouseIds: add } });
    if (products.length) steps.push({ method: 'POST', path: VISIBILITY, body: shown(products, add) });
  }
  if (remove.length) {
    steps.push({ method: 'DELETE', path: `${base}/warehouse`, body: { warehouseIds: remove } });
    if (products.length) steps.push({ method: 'DELETE', path: VISIBILITY, body: hidden(products, remove) });
  }
  return steps;
}

/** Deleting: the group, then its products are hidden again in the group's branches. */
export function deleteSteps(g: GroupRow): Step[] {
  const steps: Step[] = [{ method: 'DELETE', path: '/api/product-v2/group', body: { groupId: g.groupId } }];
  const pairs = hidden(g.products.map((p) => ({ productId: p.productId, variantId: p.productVariantId })), g.warehouses.map((w) => w.warehouseId));
  if (pairs.input.length) steps.push({ method: 'DELETE', path: VISIBILITY, body: pairs });
  return steps;
}

/**
 * kh-pos sends the whole user record of the creator (including a login token) with every group. The
 * phone keeps only the name, so the token is never saved in the offline copy.
 */
export const slimGroup = (g: GroupRow): GroupRow => ({ ...g, createdBy: g.createdBy ? { fullname: g.createdBy.fullname ?? null } : null });
