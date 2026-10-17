import type { CountableStatus, LineDiscount, OrderLine, StaffUser } from './api';
import { statusQty } from './order';

export type Action = 'create' | 'read' | 'update' | 'delete';

/**
 * kh-pos permission check (src/hooks/use-permissions.ts + lib/permissions.ts): OWNER may do
 * everything; otherwise the role's list for the resource, stored as "create,read,update".
 * A resource missing from the list means read only.
 */
export function can(user: StaffUser | null | undefined, resource: string, action: Action): boolean {
  const role = user?.role;
  if (!role) return false;
  if (role.role === 'OWNER') return true;
  const entry = role.permissions?.[resource];
  if (!entry) return action === 'read';
  const actions = Array.isArray(entry) ? entry : entry.split(',').map((s) => s.trim());
  return actions.includes(action);
}

/**
 * Who may change a status count, as in the web "Quantity Management": pending always;
 * preparing (cooking) and served need order-preparation update and delete.
 */
export function canEditStatus(user: StaffUser | null | undefined, status: CountableStatus): boolean {
  if (status === 'pending') return true;
  return can(user, 'order-preparation', 'update') && can(user, 'order-preparation', 'delete');
}

export type StatusChangeCheck = 'ok' | 'atLeastOne' | 'confirmZero';

/** The web's checks before setting a status count: something must remain; zeroing cooking/served is confirmed. */
export function checkStatusChange(line: OrderLine, status: CountableStatus, qty: number): StatusChangeCheck {
  const next = (s: CountableStatus) => (s === status ? qty : statusQty(line, s));
  if (next('pending') + next('cooking') + next('served') <= 0) return 'atLeastOne';
  if (qty < 1 && status !== 'pending') return 'confirmZero';
  return 'ok';
}

/** The line's special instructions (the "notes" option), if any. */
export function lineNote(line: OrderLine): { exists: boolean; notes: string; price: number } {
  const m = (line.orderModifiers ?? []).find((x) => x.modifierItemId === 'notes');
  return { exists: !!m, notes: m?.notes ?? '', price: Number(m?.price ?? 0) || 0 };
}

export function manualDiscount(line: OrderLine): LineDiscount | null {
  return (line.discounts ?? []).find((d) => d.isManualDiscount || d.discountId === 'manual') ?? null;
}

export function appliedPromotionIds(line: OrderLine): Set<string> {
  return new Set((line.discounts ?? []).filter((d) => !d.isManualDiscount && d.discountId !== 'manual').map((d) => d.discountId));
}

/** Option ids (not the note) on the line. */
export function lineOptionIds(line: OrderLine): Set<string> {
  return new Set((line.orderModifiers ?? []).filter((m) => m.modifierItemId !== 'notes').map((m) => m.modifierItemId));
}
