import { cinemaCsv, cinemaQuery, clockOf, dayShort, defaultMovieFilter, hasMovieFilter, movieEntries, type CinemaReport } from './cinema-report';

const t = (qty: number, amount: number) => ({ qty, totalPrice: amount, modifier: 0, discount: 0, amount });
const show = (qty: number, amount: number) => ({ showDate: '2026-10-19 00:00:00', startTime: '2026-10-19 14:30:00', endTime: '2026-10-19 16:10:00', ...t(qty, amount) });
const report: CinemaReport = {
  grand: t(30, 300),
  'Avatar': { totals: t(20, 200), showtimes: [show(10, 100), show(10, 100)] },
  'Batman, Begins': { totals: t(5, 90), showtimes: [show(5, 90)] },
  'Cars': { totals: t(5, 10), showtimes: [show(2, 4), show(2, 4), show(1, 2)] },
};

describe('cinema sales report', () => {
  it('queries whole days for the branch', () => {
    expect(cinemaQuery({ start: '2026-10-01 00:00:00', end: '2026-10-05 23:59:59' }, 'w1')).toBe('startDate=2026-10-01&endDate=2026-10-05&warehouseId=w1');
  });
  it('sorts by showtime count by default, biggest first, and leaves out the grand total', () => {
    expect(movieEntries(report, defaultMovieFilter()).map(([k]) => k)).toEqual(['Cars', 'Avatar', 'Batman, Begins']);
    expect(movieEntries(report, { ...defaultMovieFilter(), sortBy: 'amount' }).map(([k]) => k)).toEqual(['Avatar', 'Batman, Begins', 'Cars']);
    expect(movieEntries(report, { ...defaultMovieFilter(), sortBy: 'tickets', order: 'asc' }).map(([k]) => k)[2]).toBe('Avatar');
    expect(movieEntries(null, defaultMovieFilter())).toEqual([]);
  });
  it('filters by title, minimum tickets and minimum amount', () => {
    const f = defaultMovieFilter();
    expect(movieEntries(report, { ...f, search: ' av ' }).map(([k]) => k)).toEqual(['Avatar']);
    expect(movieEntries(report, { ...f, minTickets: '6' }).map(([k]) => k)).toEqual(['Avatar']);
    expect(movieEntries(report, { ...f, minAmount: '50' }).map(([k]) => k).sort()).toEqual(['Avatar', 'Batman, Begins']);
    expect(movieEntries(report, { ...f, minTickets: 'x' })).toHaveLength(3);
    expect(hasMovieFilter(f)).toBe(false);
    expect(hasMovieFilter({ ...f, minAmount: '1' })).toBe(true);
  });
  it('shows short dates and times', () => {
    expect(dayShort('2026-10-19 00:00:00')).toBe('10/19');
    expect(clockOf('2026-10-19T14:30:00.000Z')).toBe('14:30');
    expect(dayShort(null)).toBe('');
  });
  it('exports the web columns', () => {
    const lines = cinemaCsv(report, movieEntries(report, defaultMovieFilter())).split('\n');
    expect(lines[0]).toBe('Type,Movie,Show Date,Start Time,End Time,Tickets Qty,Total Price,Modifier,Discount,Final Amount');
    expect(lines[1]).toBe('GRAND TOTAL,ALL MOVIES,,,,30,300,0,0,300');
    expect(lines[2]).toBe('MOVIE TOTAL,Cars,,,,5,10,0,0,10');
    expect(lines[3]).toBe('SHOWTIME,Cars,2026-10-19,14:30,16:10,2,4,0,0,4');
    expect(lines.some((l) => l.startsWith('MOVIE TOTAL,"Batman, Begins"'))).toBe(true);
  });
});
