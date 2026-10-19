/** Product groups like the kh-pos web page: a named set of product variants, shown in the chosen branches. */

export interface GroupRow {
  groupId: string;
  groupName: string;
  description?: string | null;
  warehouses: { warehouseId: string; warehouse?: { name?: string | null } | null }[];
  products: { productId: string; productVariantId: string; product?: { title?: string | null } | null; variant?: { name?: string | null } | null }[];
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
