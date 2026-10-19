/** Manual ticket upload like the kh-pos web page: record tickets sold elsewhere (per movie, hall, day, show time), as finished orders. */

const n = (v: unknown) => Number(v) || 0;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ManualShow {
  /** HH:mm */
  time: string;
  tickets: number;
}

export interface ManualRow {
  movieId: string;
  movieName: string;
  hallId: string;
  /** YYYY-MM-DD */
  day: string;
  basePrice: number;
  shows: ManualShow[];
}

export const emptyRow = (day: string): ManualRow => ({ movieId: '', movieName: '', hallId: '', day, basePrice: 0, shows: [{ time: '', tickets: 0 }] });

export type ManualProblem = 'rows' | 'movie' | 'hall' | 'day' | 'price' | 'time' | 'tickets';

/** The first thing wrong, with the row it is in. Rows with no tickets at all are not allowed. */
export function validateManual(rows: ManualRow[]): { index: number; problem: ManualProblem } | null {
  if (rows.length === 0) return { index: -1, problem: 'rows' };
  for (const [index, r] of rows.entries()) {
    if (!r.movieId) return { index, problem: 'movie' };
    if (!r.hallId) return { index, problem: 'hall' };
    if (!DAY.test(r.day)) return { index, problem: 'day' };
    if (!(n(r.basePrice) >= 0)) return { index, problem: 'price' };
    if (r.shows.some((s) => !HH_MM.test(s.time))) return { index, problem: 'time' };
    if (!r.shows.some((s) => n(s.tickets) > 0) || r.shows.some((s) => n(s.tickets) < 0)) return { index, problem: 'tickets' };
  }
  return null;
}

export const totalTickets = (rows: ManualRow[]) => rows.reduce((sum, r) => sum + r.shows.reduce((s, x) => s + Math.max(0, Math.floor(n(x.tickets))), 0), 0);

/** The body kh-pos wants: shows with no tickets are left out, times become full date-times. */
export function manualBody(rows: ManualRow[]) {
  return rows.map((r) => ({
    movieId: r.movieId,
    showdate: r.day,
    hallId: r.hallId,
    basePrice: n(r.basePrice),
    showtimes: r.shows.filter((s) => n(s.tickets) > 0).map((s) => ({ datetime: `${r.day} ${s.time}:00`, ticket: Math.floor(n(s.tickets)) })),
  }));
}
