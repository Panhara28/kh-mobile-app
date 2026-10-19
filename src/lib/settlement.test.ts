import { generateBody, isSettled, movieOf, owedTotals, settleBody, settlementQuery, type SettlementRow } from './settlement';

const row = (over: Partial<SettlementRow> = {}): SettlementRow => ({ id: 's1', movieId: 'm1', totalAmount: 100, shareAmount: 40.1, createdAt: null, settledAt: null, proofLink: null, productVariant: { name: 'ns', basicProduct: { title: 'Film' } }, ...over });

describe('settlement', () => {
  it('names the movie and knows what is settled', () => {
    expect(movieOf(row())).toBe('Film');
    expect(movieOf(row({ productVariant: null }))).toBe('?');
    expect(isSettled(row())).toBe(false);
    expect(isSettled(row({ settledAt: '2026-10-19 10:00:00' }))).toBe(true);
  });
  it('totals what is owed and what was paid', () => {
    expect(owedTotals([row(), row({ shareAmount: 0.2 }), row({ shareAmount: 10, settledAt: 'x' })])).toEqual({ open: 40.3, paid: 10 });
  });
  it('builds the list query', () => {
    expect(settlementQuery({ filter: 'all', limit: 30, offset: 0 })).toBe('limit=30&offset=0');
    expect(settlementQuery({ filter: 'open', limit: 30, offset: 30 })).toBe('limit=30&offset=30&isSettled=false');
    expect(settlementQuery({ filter: 'settled', limit: 30, offset: 0 })).toBe('limit=30&offset=0&isSettled=true');
  });
  it('generates for whole days and settles only with a proof link', () => {
    expect(generateBody({ start: '2026-10-01 00:00:00', end: '2026-10-31 23:59:59' })).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(settleBody('s1', ' https://x/y.jpg ')).toEqual({ settlementId: 's1', proofLink: 'https://x/y.jpg' });
    expect(settleBody('s1', '')).toBeNull();
    expect(settleBody('s1', null)).toBeNull();
  });
});
