import { guestCsv, guestQuery, guestSummary, guestTable, hourText, recordCount, type GuestItem } from './guest-report';

const items: GuestItem[] = [
  { type: 'guest_total', date: '2026-10-17 - 2026-10-18', hour: null, total_guests: 30 },
  { type: 'guest_date', date: '2026-10-17', hour: null, total_guests: 20 },
  { type: 'guest_time', date: '2026-10-17', hour: 16, total_guests: 5 },
  { type: 'guest_time', date: '2026-10-17', hour: 18, total_guests: 15 },
  { type: 'guest_date', date: '2026-10-18', hour: null, total_guests: 10 },
  { type: 'guest_time', date: '2026-10-18', hour: '09:00:00', total_guests: 10 },
];

describe('guest number report', () => {
  it('queries whole days', () => {
    expect(guestQuery({ start: '2026-10-01 00:00:00', end: '2026-10-05 23:59:59' })).toBe('startDate=2026-10-01&endDate=2026-10-05+23%3A59%3A59');
  });
  it('writes hours like the web', () => {
    expect(hourText(16)).toBe('4:00 PM');
    expect(hourText(0)).toBe('12:00 AM');
    expect(hourText('09:30:00')).toBe('9:30 AM');
    expect(hourText(12)).toBe('12:00 PM');
    expect(hourText(null)).toBe('-');
    expect(hourText('x')).toBe('-');
  });
  it('sums total, daily average and peak hour', () => {
    expect(guestSummary(items)).toEqual({ total: 30, average: 15, peakHour: '6:00 PM', peakGuests: 15 });
    expect(guestSummary([])).toEqual({ total: 0, average: 0, peakHour: 'N/A', peakGuests: 0 });
  });
  it('builds the table with hours under their day and counts records', () => {
    const t = guestTable(items);
    expect(t.total).toEqual({ date: '2026-10-17 - 2026-10-18', guests: 30 });
    expect(t.days.map((d) => [d.date, d.guests, d.hours.length])).toEqual([['2026-10-17', 20, 2], ['2026-10-18', 10, 1]]);
    expect(t.days[0]!.hours[0]).toEqual({ hour: '4:00 PM', guests: 5 });
    expect(recordCount(items, [])).toBe(3);
    expect(recordCount(items, ['2026-10-17'])).toBe(5);
  });
  it('exports the web columns', () => {
    const lines = guestCsv(items).split('\n');
    expect(lines[0]).toBe('Type,Date,Time,Total Guests');
    expect(lines[1]).toBe('GRAND TOTAL,2026-10-17 - 2026-10-18,,30');
    expect(lines[3]).toBe('Hourly Detail,2026-10-17,4:00 PM,5');
  });
});
