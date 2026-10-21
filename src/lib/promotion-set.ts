/**
 * Promotion sets on the restaurant menu, like the kh-pos web POS: a "Promotions" card adds a whole combo to the
 * table's order in one tap (asking only for slots with several options). The server works out the promotion
 * price when the lines are added; the phone only shows the sets and adds their lines.
 * Rules ported from kh-pos `src/lib/promotion-set.ts`.
 */

export type PromotionMatchType = 'VARIANT' | 'PRODUCT' | 'CATEGORY';
export type PromotionDiscountType = 'PERCENTAGE' | 'AMOUNT';

export interface PromotionSetItem {
  id: string;
  matchType: PromotionMatchType;
  matchId: string;
  matchTitle?: string;
  matchImage?: string | null;
  qty: number;
  discountType: PromotionDiscountType;
  discountValue: number;
}

export interface PromotionSet {
  id: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  /** Inclusive validity window `YYYY-MM-DD HH:mm:ss`; null = open-ended. */
  startAt?: string | null;
  endAt?: string | null;
  /** Daily window `HH:mm` (start inclusive, end exclusive); an end before the start crosses midnight. */
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  priority: number;
  items: PromotionSetItem[];
}

/** A product a slot can be filled with (the same shape the menu returns). */
export interface PromotionCandidate {
  productId: string;
  variantId: string;
  productTitle: string;
  price?: number | string;
  discountedPrice?: number | null;
  images?: { url: string; imageOrder: number | null }[];
  category?: { id: string; title: string } | null;
  modifiers?: unknown[] | null;
}

export interface PromotionSlot {
  item: PromotionSetItem;
  candidates: PromotionCandidate[];
}

/** A set that is switched on and has at least one usable slot. */
export const isEnabled = (p: PromotionSet) => p.isActive && p.items.some((i) => i.qty > 0 && !!i.matchId);

/** Whether the time of day of `at` (`YYYY-MM-DD HH:mm:ss`) is inside the set's daily window. */
export function isWithinDailyHours(p: Pick<PromotionSet, 'dailyStartTime' | 'dailyEndTime'>, at: string): boolean {
  const start = p.dailyStartTime?.slice(0, 5);
  const end = p.dailyEndTime?.slice(0, 5);
  if (!start || !end || start === end) return true;
  const time = at.slice(11, 16);
  return start < end ? time >= start && time < end : time >= start || time < end;
}

export type Availability = 'active' | 'waiting' | 'hidden';

/** active: orderable now. waiting: runs today but not yet (shown, not orderable). hidden: off, ended or not started today. */
export function availability(p: PromotionSet, at: string): Availability {
  if (!isEnabled(p)) return 'hidden';
  if (p.endAt && at > p.endAt) return 'hidden';
  if (p.startAt && at < p.startAt) return p.startAt.slice(0, 10) === at.slice(0, 10) ? 'waiting' : 'hidden';
  return isWithinDailyHours(p, at) ? 'active' : 'waiting';
}

/** `HH:mm` a waiting set becomes orderable today, or null. */
export function startsAt(p: PromotionSet, at: string): string | null {
  const daily = p.dailyStartTime?.slice(0, 5) || null;
  if (p.startAt && at < p.startAt) {
    const start = p.startAt.slice(11, 16);
    if (daily && !isWithinDailyHours(p, p.startAt)) return daily > start ? daily : start;
    return start;
  }
  return daily;
}

export interface VisibleSet {
  promotion: PromotionSet;
  availability: Availability;
  startsAt: string | null;
}

/** The sets the menu shows: orderable first, then by priority and title. */
export function visibleSets(sets: PromotionSet[], at: string): VisibleSet[] {
  return sets
    .map((promotion) => ({ promotion, availability: availability(promotion, at), startsAt: startsAt(promotion, at) }))
    .filter((p) => p.availability !== 'hidden')
    .sort((a, b) => Number(b.availability === 'active') - Number(a.availability === 'active') || b.promotion.priority - a.promotion.priority || a.promotion.title.localeCompare(b.promotion.title));
}

export interface SummaryLabels {
  free: string;
  percentOff: (v: number) => string;
  amountOff: (v: number) => string;
}

/** "6 x Beer + 2 x Beer (free) + 1 x Meat (-10%)". */
export function describeSet(items: PromotionSetItem[], labels: SummaryLabels): string {
  return items
    .filter((i) => i.qty > 0)
    .map((i) => {
      const base = `${i.qty} x ${i.matchTitle || i.matchType.toLowerCase()}`;
      const reward = rewardLabel(i, labels);
      return reward ? `${base} (${reward})` : base;
    })
    .join(' + ');
}

/** "free", "-20%" or "-$1 each" for a slot that gives a reward; '' for a condition-only slot. */
export function rewardLabel(i: PromotionSetItem, labels: SummaryLabels): string {
  if (!(i.discountValue > 0)) return '';
  if (i.discountType === 'PERCENTAGE') return i.discountValue >= 100 ? labels.free : labels.percentOff(i.discountValue);
  return labels.amountOff(i.discountValue);
}

export const totalItems = (p: PromotionSet) => p.items.reduce((sum, i) => sum + i.qty, 0);

export interface PromotionLine {
  product: PromotionCandidate;
  quantity: number;
}

/** One chosen product per slot becomes cart lines; slots that land on the same variant are merged (6 + 2 beer → 8). Null if a slot has no choice. */
export function buildLines(slots: PromotionSlot[], chosen: (PromotionCandidate | undefined)[]): PromotionLine[] | null {
  const byVariant = new Map<string, PromotionLine>();
  for (const [index, slot] of slots.entries()) {
    const product = chosen[index];
    if (!product) return null;
    const line = byVariant.get(product.variantId);
    if (line) line.quantity += slot.item.qty;
    else byVariant.set(product.variantId, { product, quantity: slot.item.qty });
  }
  return [...byVariant.values()];
}

/** A slot with one option needs no question. */
export const needsChoice = (slots: PromotionSlot[]) => slots.some((s) => s.candidates.length > 1);
/** Some slot has nothing on the menu right now, so the set can't be added. */
export const unavailable = (slots: PromotionSlot[]) => slots.some((s) => s.candidates.length === 0);
/** The default pick: the only option of a slot, otherwise nothing yet. */
export const defaultChoices = (slots: PromotionSlot[]) => slots.map((s) => (s.candidates.length === 1 ? s.candidates[0] : undefined));
