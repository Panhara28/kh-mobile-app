import { emptyShowtime, movieName, seatsLabel, showtimeBody, showtimeForm, showtimeQuery, statusTone, timesOf, timeSpan, validateShowtime, type ShowtimeForm, type ShowtimeRow } from './cinema';

const ok = (over: Partial<ShowtimeForm> = {}): ShowtimeForm => ({ ...emptyShowtime('2026-10-19'), movieId: 'm1', movieName: 'Film', hallId: 'h1', start: '19:30', end: '21:45', basePrice: 5, ...over });
const row: ShowtimeRow = { showtimeId: 's1', hallId: 'h1', movieId: 'm1', showDate: '2026-10-19', startTime: '2026-10-19 19:30:00', endTime: '2026-10-19 21:45:00', basePrice: 5, status: 'selling', availableSeats: 40, totalSeats: 100, priceTemplateId: 't1', variant: [{ name: 'ns', basicProduct: { title: 'Film' } }] };

describe('checking a showtime', () => {
  it('accepts a good one', () => expect(validateShowtime(ok())).toBeNull());
  it('needs movie, hall, a real day and times', () => {
    expect(validateShowtime(ok({ movieId: '' }))).toBe('movieId');
    expect(validateShowtime(ok({ hallId: '' }))).toBe('hallId');
    expect(validateShowtime(ok({ showDate: '19/10/2026' }))).toBe('showDate');
    expect(validateShowtime(ok({ start: '7:30' }))).toBe('start');
    expect(validateShowtime(ok({ end: '25:00' }))).toBe('end');
    expect(validateShowtime(ok({ end: '19:30' }))).toBe('end');
    expect(validateShowtime(ok({ basePrice: -1 }))).toBe('basePrice');
  });
});

describe('times', () => {
  it('builds full times, moving a film that ends after midnight to the next day', () => {
    expect(timesOf(ok())).toEqual({ startTime: '2026-10-19 19:30:00', endTime: '2026-10-19 21:45:00' });
    expect(timesOf(ok({ start: '23:00', end: '01:10' }))).toEqual({ startTime: '2026-10-19 23:00:00', endTime: '2026-10-20 01:10:00' });
    expect(timesOf(ok({ showDate: '2026-12-31', start: '23:00', end: '00:30' })).endTime).toBe('2027-01-01 00:30:00');
  });
  it('reads a row into the form and back', () => {
    const f = showtimeForm(row);
    expect(f).toMatchObject({ movieName: 'Film', start: '19:30', end: '21:45', showDate: '2026-10-19', priceTemplateId: 't1' });
    expect(timeSpan(row)).toBe('19:30–21:45');
    expect(seatsLabel(row)).toBe('40/100');
    expect(movieName({ variant: null })).toBe('?');
  });
});

describe('saving', () => {
  it('a new showtime starts with every seat free and leaves the template out when none', () => {
    expect(showtimeBody(ok(), { totalSeats: 120 })).toEqual({ hallId: 'h1', movieId: 'm1', showDate: '2026-10-19', startTime: '2026-10-19 19:30:00', endTime: '2026-10-19 21:45:00', basePrice: 5, status: 'scheduled', availableSeats: 120, totalSeats: 120 });
  });
  it('an edited showtime keeps its free seats, unless the hall changed', () => {
    expect(showtimeBody({ ...showtimeForm(row), basePrice: 6 }, { totalSeats: 100 }, row)).toMatchObject({ showtimeId: 's1', availableSeats: 40, totalSeats: 100, priceTemplateId: 't1', basePrice: 6 });
    expect(showtimeBody({ ...showtimeForm(row), hallId: 'h2' }, { totalSeats: 80 }, row)).toMatchObject({ availableSeats: 80, totalSeats: 80 });
  });
  it('builds the list query and colours the status', () => {
    expect(showtimeQuery({ limit: 30, offset: 0 })).toBe('limit=30&offset=0');
    expect(showtimeQuery({ day: '2026-10-19', status: 'selling', limit: 10, offset: 10 })).toBe('limit=10&offset=10&showDate=2026-10-19&status=selling');
    expect([statusTone('selling'), statusTone('scheduled'), statusTone('started'), statusTone('sold_out'), statusTone('ended')]).toEqual(['success', 'info', 'warning', 'destructive', 'outline']);
  });
});
