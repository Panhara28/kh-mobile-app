/** The Guest Number Report of the kh-pos web app. */

const n = (v: unknown) => Number(v) || 0;

export interface GuestItem {
  type: 'guest_total' | 'guest_date' | 'guest_time' | string;
  date: string | null;
  /** An hour of the day (16) or "16:00:00". */
  hour: string | number | null;
  total_guests: number;
}

export function guestQuery(range: { start: string; end: string }): string {
  return new URLSearchParams({ startDate: range.start.slice(0, 10), endDate: `${range.end.slice(0, 10)} 23:59:59` }).toString();
}

/** "4:00 PM" like the web. */
export function hourText(h: string | number | null | undefined): string {
  if (h === null || h === undefined || h === '') return '-';
  const hour = typeof h === 'number' ? h : parseInt(String(h).split(':')[0] ?? '', 10);
  if (Number.isNaN(hour)) return '-';
  const mins = typeof h === 'string' && h.includes(':') ? (h.split(':')[1] ?? '00').padStart(2, '0') : '00';
  return `${hour % 12 || 12}:${mins} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** Total guests, the daily average (rounded) and the busiest hour of the period. */
export function guestSummary(items: GuestItem[]) {
  const total = n(items.find((i) => i.type === 'guest_total')?.total_guests);
  const days = items.filter((i) => i.type === 'guest_date');
  const hours = items.filter((i) => i.type === 'guest_time');
  const peak = hours.reduce<GuestItem | null>((p, c) => (p === null || n(c.total_guests) > n(p.total_guests) ? c : p), null);
  return { total, average: days.length > 0 ? Math.round(total / days.length) : 0, peakHour: peak ? hourText(peak.hour) : 'N/A', peakGuests: peak ? n(peak.total_guests) : 0 };
}

export interface GuestDay {
  date: string;
  guests: number;
  hours: { hour: string; guests: number }[];
}

/** The grand total row and each day with its hours. */
export function guestTable(items: GuestItem[]): { total: { date: string; guests: number } | null; days: GuestDay[] } {
  const t = items.find((i) => i.type === 'guest_total');
  return {
    total: t ? { date: t.date ?? '-', guests: n(t.total_guests) } : null,
    days: items
      .filter((i) => i.type === 'guest_date')
      .map((d) => ({ date: d.date ?? '', guests: n(d.total_guests), hours: items.filter((i) => i.type === 'guest_time' && (i.date ?? '') === (d.date ?? '')).map((i) => ({ hour: hourText(i.hour), guests: n(i.total_guests) })) })),
  };
}

/** Records the table shows: the total, every day, and the hours of the days that are open. */
export const recordCount = (items: GuestItem[], open: string[]) => {
  const { total, days } = guestTable(items);
  return days.length + (total ? 1 : 0) + days.filter((d) => open.includes(d.date)).reduce((a, d) => a + d.hours.length, 0);
};

export function guestCsv(items: GuestItem[]): string {
  const rows = items.map((i) => [i.type === 'guest_total' ? 'GRAND TOTAL' : i.type === 'guest_date' ? 'Daily Summary' : 'Hourly Detail', i.date ?? '', i.hour !== null && i.hour !== '' ? hourText(i.hour) : '', n(i.total_guests)].join(','));
  return ['Type,Date,Time,Total Guests', ...rows].join('\n');
}
