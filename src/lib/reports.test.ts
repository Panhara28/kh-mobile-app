import { barShare, breakdownSections, busiestHours, dateQuery, expiryList, guestSections, hourLabel, profitByDay, salesByDay, stockSections, summaryRows, topItems, totalSales, voidLoss, type ExpiryItem, type GuestRow, type SaleBreakdownRow, type StockRow, type VoidRow } from './reports';

describe('sales', () => {
  const lines = [
    { qty: 2, total_amount: '5.50', paid_at: '2026-10-19' },
    { qty: 1, total_amount: 3, paid_at: '2026-10-18' },
    { qty: 1, total_amount: '1.10', paid_at: '2026-10-19' },
    { qty: 1, total_amount: 'x', paid_at: '' },
  ];
  it('sums per paid day, oldest first, and ignores lines without a day', () => {
    expect(salesByDay(lines)).toEqual([
      { date: '2026-10-18', amount: 3, qty: 1 },
      { date: '2026-10-19', amount: 6.6, qty: 3 },
    ]);
    expect(totalSales(lines)).toBe(9.6);
  });
  it('builds the date query the API wants', () => {
    expect(dateQuery({ start: '2026-10-19 00:00:00', end: '2026-10-19 23:59:59' })).toBe('startDate=2026-10-19+00%3A00%3A00&endDate=2026-10-19+23%3A59%3A59');
  });
});

describe('profit', () => {
  it('shows cost as a positive number and sums per day', () => {
    const rows = profitByDay([
      { date: '2026-10-19', sale: '10', cost: '-4', profit: '6' },
      { date: '2026-10-19', sale: 5, cost: null, profit: null },
      { date: '2026-10-18', sale: 2, cost: -1, profit: 1 },
    ]);
    expect(rows).toEqual([
      { date: '2026-10-18', sale: 2, cost: 1, profit: 1 },
      { date: '2026-10-19', sale: 15, cost: 4, profit: 6 },
    ]);
  });
});

describe('busy hours and items', () => {
  it('finds the best hours and items', () => {
    const hours = busiestHours([
      { week_of_day: 0, hore_of_week: 9, total_qty: 1, total_amount: 5 },
      { week_of_day: 4, hore_of_week: 19, total_qty: 9, total_amount: 90 },
      { week_of_day: 5, hore_of_week: 12, total_qty: 4, total_amount: 40 },
    ], 2);
    expect(hours.map((h) => h.hore_of_week)).toEqual([19, 12]);
    expect(hourLabel(7)).toBe('07:00');
    const items = [
      { description: 'A', qty: 1, discount_amount: 0, total_amount: 9 },
      { description: 'B', qty: 5, discount_amount: 0, total_amount: 2 },
    ];
    expect(topItems(items).map((i) => i.description)).toEqual(['A', 'B']);
    expect(topItems(items, 'qty').map((i) => i.description)).toEqual(['B', 'A']);
  });
});

describe('end of day', () => {
  it('lists a summary largest first', () => {
    expect(summaryRows({ cash: { qty: 2, amount: 10 }, card: { qty: 1, amount: 30.456 } })).toEqual([
      { name: 'card', qty: 1, amount: 30.46 },
      { name: 'cash', qty: 2, amount: 10 },
    ]);
    expect(summaryRows(undefined)).toEqual([]);
  });
});

describe('breakdown, stock, guests', () => {
  const row = (over: Partial<SaleBreakdownRow>): SaleBreakdownRow => ({ type: 'detail', totalQty: 1, supplyPrice: 0, totalPrice: 0, modifier: 0, discount: 0, revenue: 0, profit: 0, ...over });
  it('groups breakdown rows under their category', () => {
    const { total, sections } = breakdownSections([row({ type: 'header' }), row({ type: 'total', name: 'All' }), row({ type: 'category', name: 'Food' }), row({ name: 'Rice' }), row({ name: 'Soup' }), row({ type: 'category', name: 'Drinks' }), row({ name: 'Tea' })]);
    expect(total?.name).toBe('All');
    expect(sections.map((s) => [s.category.name, s.items.map((i) => i.name)])).toEqual([['Food', ['Rice', 'Soup']], ['Drinks', ['Tea']]]);
  });
  it('groups stock rows', () => {
    const s = (type: StockRow['type'], name: string): StockRow => ({ type, name, product_code: '', qty: 1, cost: 1, price: 1 });
    const { total, sections } = stockSections([s('total', 'All'), s('warehouse', 'Main'), s('category', 'Food'), s('detail', 'Rice')]);
    expect(total?.name).toBe('All');
    expect(sections.map((x) => [x.title.name, x.items.length])).toEqual([['Main', 0], ['Food', 1]]);
  });
  it('groups guests per day and hour', () => {
    const g = (type: GuestRow['type'], date: string | null, hour: string | null, total_guests: number): GuestRow => ({ type, date, hour, total_guests });
    expect(guestSections([g('guest_total', 'a - b', null, 7), g('guest_date', '2026-10-19', null, 7), g('guest_time', '2026-10-19', '12', 4), g('guest_time', '2026-10-19', '19', 3)])).toEqual({
      total: 7,
      days: [{ date: '2026-10-19', guests: 7, hours: [{ hour: '12', guests: 4 }, { hour: '19', guests: 3 }] }],
    });
  });
});

describe('void and expiry', () => {
  it('works out what went to the kitchen but is not on the order', () => {
    const r = (over: Partial<VoidRow>): VoidRow => ({ orderDetailId: 'x', qtyFromPrintLog: 3, priceFromPrintLog: 2, actualQty: 1, actualPrice: 2, status: 'ABNORMAL', ...over });
    expect(voidLoss([r({}), r({ status: 'VOIDED', actualQty: 0 })])).toBe(4 + 6);
    expect(voidLoss([])).toBe(0);
  });

  it('lists what is expiring, most urgent first', () => {
    const i = (status: ExpiryItem['status'], daysLeft: number): ExpiryItem => ({ expiryDate: 'd', quantity: 1, value: 1, status, daysLeft });
    const list = [i('warning', 20), i('expired', 0), i('urgent', 3), i('ok', 100), i('urgent', 1)];
    expect(expiryList(list, 'all').map((x) => `${x.status}${x.daysLeft}`)).toEqual(['expired0', 'urgent1', 'urgent3', 'warning20']);
    expect(expiryList(list, 'urgent')).toHaveLength(2);
  });

  it('sizes bars', () => {
    expect(barShare(50, 100)).toBe(0.5);
    expect(barShare(0, 100)).toBe(0);
    expect(barShare(1, 1000)).toBe(0.03);
    expect(barShare(5, 0)).toBe(0);
  });
});
