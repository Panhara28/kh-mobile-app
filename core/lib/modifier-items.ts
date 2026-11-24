// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
export interface ModifierItemInput {
  id?: string;
  name: string;
  price: number;
}

export interface ModifierItemPlan {
  /** Existing options that stay: their name and price are updated in place (their id never changes). */
  update: { id: string; name: string; price: number }[];
  /** Options to add: they get a fresh id. */
  insert: { name: string; price: number }[];
}

/**
 * Works out what saving a modifier does to its options. An option that arrives with the id of one of the
 * modifier's current options is that option (updated in place, so orders that point at its id keep working); an option
 * without an id, or with an id the modifier does not have, is new. Options that do not arrive are removed by the caller
 * (everything current that is not in `update`).
 */
export function planModifierItems(currentIds: string[], items: ModifierItemInput[]): ModifierItemPlan {
  const current = new Set(currentIds);
  const taken = new Set<string>();
  const plan: ModifierItemPlan = { update: [], insert: [] };
  for (const x of items) {
    if (x.id && current.has(x.id) && !taken.has(x.id)) {
      taken.add(x.id);
      plan.update.push({ id: x.id, name: x.name, price: x.price });
    } else {
      plan.insert.push({ name: x.name, price: x.price });
    }
  }
  return plan;
}
