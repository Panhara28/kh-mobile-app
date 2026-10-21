import { emptyPromo, newPromoItem, promoBody, promoForm, promoSummary, validatePromo, type PromoForm, type PromoRow } from './promotion-sets';

const ok = (over: Partial<PromoForm> = {}): PromoForm => ({
  ...emptyPromo('p1'),
  title: ' Beer deal ',
  items: [{ ...newPromoItem('VARIANT', 'v1', 'Beer'), qty: 6 }, { ...newPromoItem('VARIANT', 'v1', 'Beer'), qty: 2, discountValue: 100 }],
  ...over,
});

describe('checking a promotion set', () => {
  it('accepts a good one', () => expect(validatePromo(ok())).toBeNull());
  it('needs a title, items, targets, whole quantities and a reward', () => {
    expect(validatePromo(ok({ title: ' ' }))).toBe('title');
    expect(validatePromo(ok({ items: [] }))).toBe('items');
    expect(validatePromo(ok({ items: [newPromoItem('VARIANT', '', 'x')] }))).toBe('target');
    expect(validatePromo(ok({ items: [{ ...newPromoItem('VARIANT', 'v', 'x'), qty: 0, discountValue: 5 }] }))).toBe('qty');
    expect(validatePromo(ok({ items: [{ ...newPromoItem('VARIANT', 'v', 'x'), qty: 1.5, discountValue: 5 }] }))).toBe('qty');
    expect(validatePromo(ok({ items: [newPromoItem('VARIANT', 'v', 'x')] }))).toBe('reward');
    expect(validatePromo(ok({ items: [{ ...newPromoItem('VARIANT', 'v', 'x'), discountValue: 101 }] }))).toBe('percent');
  });
  it('checks the dates and the daily hours', () => {
    expect(validatePromo(ok({ startAt: '2026-1-1' }))).toBe('dateFormat');
    expect(validatePromo(ok({ startAt: '2026-02-01', endAt: '2026-01-01' }))).toBe('dates');
    expect(validatePromo(ok({ dailyStartTime: '17:00' }))).toBe('hours');
    expect(validatePromo(ok({ dailyStartTime: '17:00', dailyEndTime: '17:00' }))).toBe('hoursEqual');
    expect(validatePromo(ok({ dailyStartTime: '25:00', dailyEndTime: '02:00' }))).toBe('timeFormat');
    expect(validatePromo(ok({ dailyStartTime: '22:00', dailyEndTime: '02:00' }))).toBeNull();
  });
});

describe('saving', () => {
  it('builds the body with whole-day dates and nulls for empty windows', () => {
    const body = promoBody(ok({ startAt: '2026-01-01', endAt: '2026-01-31', maxApplyPerOrder: 0, description: ' ' }), 'w1');
    expect(body).toMatchObject({ id: 'p1', title: 'Beer deal', description: null, warehouseId: 'w1', startAt: '2026-01-01 00:00:00', endAt: '2026-01-31 23:59:59', dailyStartTime: null, maxApplyPerOrder: null });
    expect(body.items[1]).toEqual({ matchType: 'VARIANT', matchId: 'v1', qty: 2, discountType: 'PERCENTAGE', discountValue: 100 });
  });
  it('keeps the branch scope and item ids when editing', () => {
    const row: PromoRow = { id: 'p1', title: 'T', warehouseId: null, isActive: true, startAt: '2026-01-01 00:00:00', dailyStartTime: '17:00:00', dailyEndTime: '19:00:00', priority: 2, items: [{ id: 'i1', matchType: 'CATEGORY', matchId: 'c1', matchTitle: 'Drinks', qty: 2, discountType: 'AMOUNT', discountValue: 1 }] };
    const f = promoForm(row);
    expect(f).toMatchObject({ startAt: '2026-01-01', dailyStartTime: '17:00', dailyEndTime: '19:00', priority: 2 });
    const body = promoBody(f, 'w1', row);
    expect(body.warehouseId).toBeNull();
    expect(body.items[0]).toMatchObject({ id: 'i1' });
  });
  it('summarises for the list', () => {
    expect(promoSummary({ items: ok().items })).toBe('6× Beer + 2× Beer (−100%)');
  });
});
