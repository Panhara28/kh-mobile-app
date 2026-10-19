import type { CountableStatus, LineDiscount, OrderLine, StaffUser } from './api';
import { statusQty } from './order';

export type Action = 'create' | 'read' | 'update' | 'delete';

/**
 * kh-pos permission check (src/hooks/use-permissions.ts + lib/permissions.ts): OWNER may do
 * everything; otherwise the role's list for the resource, stored as "create,read,update".
 * A resource missing from the list means read only.
 */
/** Parts of the web app that have no permission of their own: anyone signed in may use them (kh-pos shows them when the branch turns them on). */
const OPEN_RESOURCES = ['accounting'];

export function can(user: StaffUser | null | undefined, resource: string, action: Action): boolean {
  const role = user?.role;
  if (!role) return false;
  if (OPEN_RESOURCES.includes(resource)) return true;
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

/** Every resend of the line's kitchen ticket, in order: who sent it and how many portions. */
export function resendSummary(line: OrderLine): { who: string; qty: number | null }[] {
  return (line.kitchenResends ?? []).map((r) => ({ who: r.by, qty: r.qty }));
}

/** Portions already sent to the kitchen (not pending): what a resend prints. */
export function sentQty(line: OrderLine): number {
  return statusQty(line, 'cooking') + statusQty(line, 'ready') + statusQty(line, 'served');
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

/** Delete a line: anyone while nothing went to the kitchen; afterwards the same rights as editing preparing/served counts. */
export function canDeleteLine(user: StaffUser | null | undefined, line: OrderLine): boolean {
  const started = (line.status ?? []).some((s) => s.status !== 'pending' && Number(s.qty) > 0);
  return !started || canEditStatus(user, 'cooking');
}
