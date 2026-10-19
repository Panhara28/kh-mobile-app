/** Cinema showtimes like the kh-pos web Showtime page: which movie plays in which hall, when, at what price. */

const n = (v: unknown) => Number(v) || 0;

export type ShowtimeStatus = 'scheduled' | 'selling' | 'sold_out' | 'started' | 'ended' | 'cancelled';
export const SHOWTIME_STATUSES: ShowtimeStatus[] = ['scheduled', 'selling', 'sold_out', 'started', 'ended', 'cancelled'];

export interface HallRow {
  id: string;
  name: string;
  number: number;
  status: 'active' | 'maintenance' | 'inactive';
  totalSeats: number;
}

export interface TemplateRow {
  template_id: string;
  template_name: string;
}

export interface ShowtimeRow {
  showtimeId: string;
  hallId: string;
  movieId: string;
  showDate: string;
  /** "YYYY-MM-DD HH:mm:ss" */
  startTime: string;
  endTime: string;
  basePrice: number;
  status: ShowtimeStatus;
  availableSeats: number;
  totalSeats: number;
  priceTemplateId?: string | null;
  variant?: { id?: string; name?: string | null; basicProduct?: { title?: string | null } | null }[] | null;
  hall?: { name?: string } | null;
}

export type ShowtimeForm = {
  movieId: string;
  movieName: string;
  hallId: string;
  /** YYYY-MM-DD */
  showDate: string;
  /** HH:mm */
  start: string;
  end: string;
  basePrice: number;
  status: ShowtimeStatus;
  priceTemplateId: string;
};

export const emptyShowtime = (day: string): ShowtimeForm => ({ movieId: '', movieName: '', hallId: '', showDate: day, start: '', end: '', basePrice: 0, status: 'scheduled', priceTemplateId: '' });

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The movie's name: its product title and variant, as the server sent it. */
export function movieName(s: Pick<ShowtimeRow, 'variant'>): string {
  const v = s.variant?.[0];
  if (!v) return '?';
  const title = v.basicProduct?.title ?? '';
  const variant = v.name && v.name !== 'ns' ? v.name : '';
  return [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?';
}

export function showtimeForm(s: ShowtimeRow): ShowtimeForm {
  return {
    movieId: s.movieId,
    movieName: movieName(s),
    hallId: s.hallId,
    showDate: s.showDate.slice(0, 10),
    start: s.startTime.slice(11, 16),
    end: s.endTime.slice(11, 16),
    basePrice: n(s.basePrice),
    status: s.status,
    priceTemplateId: s.priceTemplateId ?? '',
  };
}

export function validateShowtime(f: ShowtimeForm): keyof ShowtimeForm | null {
  if (!f.movieId) return 'movieId';
  if (!f.hallId) return 'hallId';
  if (!DAY.test(f.showDate)) return 'showDate';
  if (!HH_MM.test(f.start)) return 'start';
  if (!HH_MM.test(f.end)) return 'end';
  if (f.start === f.end) return 'end';
  if (n(f.basePrice) < 0) return 'basePrice';
  return null;
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** An end time earlier than the start means the film ends after midnight, on the next day. */
export function timesOf(f: Pick<ShowtimeForm, 'showDate' | 'start' | 'end'>) {
  return { startTime: `${f.showDate} ${f.start}:00`, endTime: `${f.end > f.start ? f.showDate : nextDay(f.showDate)} ${f.end}:00` };
}

/**
 * The body kh-pos wants. A new showtime starts with every seat free; an edited one keeps its free
 * seats unless the hall changed (then all seats of the new hall are free).
 */
export function showtimeBody(f: ShowtimeForm, hall: Pick<HallRow, 'totalSeats'>, existing?: ShowtimeRow) {
  const total = n(hall.totalSeats);
  const keep = existing && existing.hallId === f.hallId;
  return {
    ...(existing ? { showtimeId: existing.showtimeId } : {}),
    hallId: f.hallId,
    movieId: f.movieId,
    showDate: f.showDate,
    ...timesOf(f),
    basePrice: n(f.basePrice),
    status: f.status,
    availableSeats: keep ? Math.min(n(existing.availableSeats), total) : total,
    totalSeats: total,
    ...(f.priceTemplateId ? { priceTemplateId: f.priceTemplateId } : {}),
  };
}

export function showtimeQuery(f: { day?: string; status?: ShowtimeStatus; limit: number; offset: number }): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.day) q.set('showDate', f.day);
  if (f.status) q.set('status', f.status);
  return q.toString();
}

export function statusTone(s: ShowtimeStatus): 'success' | 'info' | 'warning' | 'destructive' | 'outline' | 'default' {
  if (s === 'selling') return 'success';
  if (s === 'scheduled') return 'info';
  if (s === 'started') return 'warning';
  if (s === 'sold_out' || s === 'cancelled') return 'destructive';
  return 'outline';
}

/** "19:30–21:45" from the full times. */
export const timeSpan = (s: Pick<ShowtimeRow, 'startTime' | 'endTime'>) => `${s.startTime.slice(11, 16)}–${s.endTime.slice(11, 16)}`;

export const seatsLabel = (s: Pick<ShowtimeRow, 'availableSeats' | 'totalSeats'>) => `${n(s.availableSeats)}/${n(s.totalSeats)}`;
