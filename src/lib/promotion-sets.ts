/** Promotion sets (combos like "buy 6 get 2 free") as the kh-pos web Discount page edits them. */

const n = (v: unknown) => Number(v) || 0;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type MatchType = 'VARIANT' | 'PRODUCT' | 'CATEGORY';
export type DiscountType = 'PERCENTAGE' | 'AMOUNT';

export interface PromoItem {
  id?: string;
  matchType: MatchType;
  matchId: string;
  matchTitle?: string;
  qty: number;
  discountType: DiscountType;
  discountValue: number;
}

export interface PromoRow {
  id: string;
  title: string;
  description?: string | null;
  warehouseId: string | null;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  maxApplyPerOrder?: number | null;
  priority: number;
  items: PromoItem[];
}

export interface PromoForm {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
  dailyStartTime: string;
  dailyEndTime: string;
  maxApplyPerOrder: number;
  priority: number;
  items: PromoItem[];
}

export const emptyPromo = (id: string): PromoForm => ({ id, title: '', description: '', isActive: true, startAt: '', endAt: '', dailyStartTime: '', dailyEndTime: '', maxApplyPerOrder: 0, priority: 0, items: [] });

export const newPromoItem = (matchType: MatchType, matchId: string, matchTitle: string): PromoItem => ({ matchType, matchId, matchTitle, qty: 1, discountType: 'PERCENTAGE', discountValue: 0 });

const day = (v?: string | null) => (v ? v.slice(0, 10) : '');

export const promoForm = (r: PromoRow): PromoForm => ({
  id: r.id,
  title: r.title,
  description: r.description ?? '',
  isActive: r.isActive,
  startAt: day(r.startAt),
  endAt: day(r.endAt),
  dailyStartTime: r.dailyStartTime?.slice(0, 5) ?? '',
  dailyEndTime: r.dailyEndTime?.slice(0, 5) ?? '',
  maxApplyPerOrder: n(r.maxApplyPerOrder),
  priority: n(r.priority),
  items: r.items.map((i) => ({ ...i })),
});

export type PromoProblem = 'title' | 'items' | 'target' | 'qty' | 'reward' | 'percent' | 'hours' | 'hoursEqual' | 'dates' | 'dateFormat' | 'timeFormat';

/** The first thing wrong with the form, in the same order kh-pos checks it; null when it is fine. */
export function validatePromo(f: PromoForm): PromoProblem | null {
  if (!f.title.trim()) return 'title';
  if (f.items.length === 0) return 'items';
  if (f.items.some((i) => !i.matchId)) return 'target';
  if (f.items.some((i) => !Number.isInteger(n(i.qty)) || n(i.qty) < 1)) return 'qty';
  if (!f.items.some((i) => n(i.discountValue) > 0)) return 'reward';
  if (f.items.some((i) => i.discountType === 'PERCENTAGE' && n(i.discountValue) > 100)) return 'percent';
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if ((f.startAt && !date.test(f.startAt)) || (f.endAt && !date.test(f.endAt))) return 'dateFormat';
  if ((f.dailyStartTime && !HH_MM.test(f.dailyStartTime)) || (f.dailyEndTime && !HH_MM.test(f.dailyEndTime))) return 'timeFormat';
  if (!!f.dailyStartTime !== !!f.dailyEndTime) return 'hours';
  if (f.dailyStartTime && f.dailyStartTime === f.dailyEndTime) return 'hoursEqual';
  if (f.startAt && f.endAt && f.startAt > f.endAt) return 'dates';
  return null;
}

/** The body kh-pos wants: dates cover whole days, empty windows are null, quantities are integers. */
export function promoBody(f: PromoForm, warehouseId: string | null, existing?: PromoRow) {
  return {
    id: f.id,
    title: f.title.trim(),
    description: f.description.trim() || null,
    warehouseId: existing ? existing.warehouseId : warehouseId,
    isActive: f.isActive,
    startAt: f.startAt ? `${f.startAt} 00:00:00` : null,
    endAt: f.endAt ? `${f.endAt} 23:59:59` : null,
    dailyStartTime: f.dailyStartTime || null,
    dailyEndTime: f.dailyEndTime || null,
    maxApplyPerOrder: Math.max(0, Math.floor(n(f.maxApplyPerOrder))) || null,
    priority: Math.floor(n(f.priority)),
    items: f.items.map((i) => ({ ...(i.id ? { id: i.id } : {}), matchType: i.matchType, matchId: i.matchId, qty: Math.floor(n(i.qty)), discountType: i.discountType, discountValue: n(i.discountValue) })),
  };
}

/** A short line for the list: what the customer needs to buy and what they get. */
export function promoSummary(r: Pick<PromoRow, 'items'>): string {
  return r.items.map((i) => `${i.qty}× ${i.matchTitle ?? '?'}${n(i.discountValue) > 0 ? ` (−${i.discountType === 'PERCENTAGE' ? `${i.discountValue}%` : `$${i.discountValue}`})` : ''}`).join(' + ');
}
