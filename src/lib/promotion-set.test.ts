import { availability, buildLines, defaultChoices, describeSet, isWithinDailyHours, needsChoice, rewardLabel, startsAt, unavailable, visibleSets, type PromotionCandidate, type PromotionSet, type PromotionSetItem, type PromotionSlot } from './promotion-set';

const labels = { free: 'free', percentOff: (v: number) => `-${v}%`, amountOff: (v: number) => `-$${v} each` };
const item = (over: Partial<PromotionSetItem> = {}): PromotionSetItem => ({ id: 'i', matchType: 'VARIANT', matchId: 'v1', matchTitle: 'Beer', qty: 1, discountType: 'PERCENTAGE', discountValue: 0, ...over });
const set = (over: Partial<PromotionSet> = {}): PromotionSet => ({ id: 's', title: 'Set', isActive: true, priority: 0, items: [item()], ...over });
const cand = (variantId: string, title = 'P'): PromotionCandidate => ({ productId: 'p', variantId, productTitle: title });
const NOON = '2026-10-21 12:00:00';

describe('daily hours and availability', () => {
  it('all day when there is no window', () => {
    expect(isWithinDailyHours({}, NOON)).toBe(true);
    expect(isWithinDailyHours({ dailyStartTime: '10:00', dailyEndTime: '10:00' }, NOON)).toBe(true);
  });
  it('inside the window, outside it, and across midnight', () => {
    expect(isWithinDailyHours({ dailyStartTime: '11:00', dailyEndTime: '14:00' }, NOON)).toBe(true);
    expect(isWithinDailyHours({ dailyStartTime: '14:00', dailyEndTime: '16:00' }, NOON)).toBe(false);
    expect(isWithinDailyHours({ dailyStartTime: '22:00', dailyEndTime: '02:00' }, '2026-10-21 23:30:00')).toBe(true);
    expect(isWithinDailyHours({ dailyStartTime: '22:00', dailyEndTime: '02:00' }, '2026-10-21 01:00:00')).toBe(true);
    expect(isWithinDailyHours({ dailyStartTime: '22:00', dailyEndTime: '02:00' }, NOON)).toBe(false);
  });
  it('active, waiting for the happy hour, or hidden', () => {
    expect(availability(set(), NOON)).toBe('active');
    expect(availability(set({ isActive: false }), NOON)).toBe('hidden');
    expect(availability(set({ items: [] }), NOON)).toBe('hidden');
    expect(availability(set({ dailyStartTime: '18:00', dailyEndTime: '20:00' }), NOON)).toBe('waiting');
    expect(availability(set({ endAt: '2026-10-20 23:59:59' }), NOON)).toBe('hidden');
    expect(availability(set({ startAt: '2026-10-21 18:00:00' }), NOON)).toBe('waiting');
    expect(availability(set({ startAt: '2026-10-25 09:00:00' }), NOON)).toBe('hidden');
  });
  it('tells when a waiting set starts', () => {
    expect(startsAt(set({ dailyStartTime: '18:00', dailyEndTime: '20:00' }), NOON)).toBe('18:00');
    expect(startsAt(set({ startAt: '2026-10-21 18:30:00' }), NOON)).toBe('18:30');
    expect(startsAt(set(), NOON)).toBeNull();
  });
  it('lists orderable sets first, then by priority and title', () => {
    const list = visibleSets([set({ id: 'w', title: 'A', dailyStartTime: '18:00', dailyEndTime: '20:00' }), set({ id: 'b', title: 'B', priority: 1 }), set({ id: 'a', title: 'A', priority: 1 }), set({ id: 'h', isActive: false })], NOON);
    expect(list.map((v) => v.promotion.id)).toEqual(['a', 'b', 'w']);
  });
});

describe('describing a set', () => {
  it('shows the reward of each slot', () => {
    const items = [item({ qty: 6 }), item({ qty: 2, discountValue: 100 }), item({ qty: 1, matchTitle: 'Meat', discountValue: 10 }), item({ qty: 1, matchTitle: 'Rice', discountType: 'AMOUNT', discountValue: 1 })];
    expect(describeSet(items, labels)).toBe('6 x Beer + 2 x Beer (free) + 1 x Meat (-10%) + 1 x Rice (-$1 each)');
    expect(rewardLabel(item(), labels)).toBe('');
  });
});

describe('building the lines to add', () => {
  const slots: PromotionSlot[] = [
    { item: item({ qty: 6 }), candidates: [cand('beer')] },
    { item: item({ qty: 2, discountValue: 100 }), candidates: [cand('beer')] },
    { item: item({ qty: 1 }), candidates: [cand('meat1'), cand('meat2')] },
  ];
  it('asks only when a slot has several options', () => {
    expect(needsChoice(slots)).toBe(true);
    expect(needsChoice(slots.slice(0, 2))).toBe(false);
    expect(defaultChoices(slots).map((c) => c?.variantId)).toEqual(['beer', 'beer', undefined]);
  });
  it('merges slots that land on the same variant, and needs a pick for every slot', () => {
    expect(buildLines(slots, [slots[0]!.candidates[0], slots[1]!.candidates[0], slots[2]!.candidates[1]])).toEqual([
      { product: cand('beer'), quantity: 8 },
      { product: cand('meat2'), quantity: 1 },
    ]);
    expect(buildLines(slots, defaultChoices(slots))).toBeNull();
  });
  it('is unavailable when a slot has nothing on the menu', () => {
    expect(unavailable([{ item: item(), candidates: [] }])).toBe(true);
    expect(unavailable(slots)).toBe(false);
  });
});
