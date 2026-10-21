/** The Cinema Sales Report (Report > Showtime Sale Report) of the kh-pos web app. */

const n = (v: unknown) => Number(v) || 0;

export interface Totals {
  qty: number;
  totalPrice: number;
  modifier: number;
  discount: number;
  amount: number;
}

export interface ShowtimeRow {
  showDate: string;
  startTime: string;
  endTime: string;
  qty: number;
  totalPrice: number;
  modifier: number;
  discount: number;
  amount: number;
}

export interface MovieSales {
  totals: Totals;
  showtimes: ShowtimeRow[];
}

/** `{ grand, "Movie title": { totals, showtimes } ... }` as the server sends it. */
export type CinemaReport = { grand?: Totals } & Record<string, MovieSales | Totals | undefined>;

export type SortBy = 'showtime' | 'tickets' | 'amount';

/** The web query: whole days, this branch. */
export function cinemaQuery(range: { start: string; end: string }, warehouseId: string): string {
  const q = new URLSearchParams({ startDate: range.start.slice(0, 10), endDate: range.end.slice(0, 10) });
  if (warehouseId) q.set('warehouseId', warehouseId);
  return q.toString();
}

export interface MovieFilter {
  search: string;
  minTickets: string;
  minAmount: string;
  sortBy: SortBy;
  order: 'asc' | 'desc';
}

export const defaultMovieFilter = (): MovieFilter => ({ search: '', minTickets: '', minAmount: '', sortBy: 'showtime', order: 'desc' });

export const hasMovieFilter = (f: MovieFilter) => !!(f.search.trim() || f.minTickets.trim() || f.minAmount.trim());

/** Movies (every key but "grand"), filtered by title, minimum tickets and minimum amount, then sorted. */
export function movieEntries(r: CinemaReport | null | undefined, f: MovieFilter): [string, MovieSales][] {
  let list = Object.entries(r ?? {}).filter(([k]) => k !== 'grand') as [string, MovieSales][];
  const q = f.search.trim().toLowerCase();
  if (q) list = list.filter(([title]) => title.toLowerCase().includes(q));
  const minT = parseInt(f.minTickets, 10);
  if (f.minTickets.trim() && !Number.isNaN(minT)) list = list.filter(([, m]) => n(m.totals?.qty) >= minT);
  const minA = parseFloat(f.minAmount);
  if (f.minAmount.trim() && !Number.isNaN(minA)) list = list.filter(([, m]) => n(m.totals?.amount) >= minA);
  const key = (m: MovieSales) => (f.sortBy === 'showtime' ? (m.showtimes ?? []).length : f.sortBy === 'tickets' ? n(m.totals?.qty) : n(m.totals?.amount));
  return [...list].sort(([, a], [, b]) => (f.order === 'asc' ? key(a) - key(b) : key(b) - key(a)));
}

/** "10/19" and "14:30" from the server's date-times. */
export function dayShort(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? `${m[2]}/${m[3]}` : '';
}
export function clockOf(v: string | null | undefined): string {
  const m = /[T ](\d{2}):(\d{2})/.exec(v ?? '');
  return m ? `${m[1]}:${m[2]}` : '';
}

/** The Excel export of the web as CSV text: grand total, then each movie total with its showtimes. */
export function cinemaCsv(r: CinemaReport, movies: [string, MovieSales][]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const row = (type: string, movie: string, date: string, start: string, end: string, t: Totals) => [type, movie, date, start, end, t.qty, t.totalPrice, t.modifier, t.discount, t.amount].map(esc).join(',');
  const lines = ['Type,Movie,Show Date,Start Time,End Time,Tickets Qty,Total Price,Modifier,Discount,Final Amount'];
  const zero: Totals = { qty: 0, totalPrice: 0, modifier: 0, discount: 0, amount: 0 };
  lines.push(row('GRAND TOTAL', 'ALL MOVIES', '', '', '', r.grand ?? zero));
  for (const [title, m] of movies) {
    lines.push(row('MOVIE TOTAL', title, '', '', '', m.totals));
    for (const s of m.showtimes ?? []) lines.push(row('SHOWTIME', title, (s.showDate ?? '').slice(0, 10), clockOf(s.startTime), clockOf(s.endTime), s));
  }
  return lines.join('\n');
}

export const cinemaExportName = (start: string, end: string) => `Cinema-Sales-Report-${start.slice(0, 10)} to ${end.slice(0, 10)}`;
