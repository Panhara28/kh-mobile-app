import { toKhPosTime } from './time';

export type RangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DateRange {
  /** "YYYY-MM-DD HH:mm:ss", the start of the first day. */
  start: string;
  /** "YYYY-MM-DD HH:mm:ss", the end of the last day. */
  end: string;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "2026-10-19" → a Date at noon (so time zones can't move the day), or null when it isn't a real date. */
export function parseDay(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 12, 0, 0);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

export const dayText = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The dates a filter sends to kh-pos, like the web filters: whole days, in the phone's (branch's)
 * time. "week" and "month" are the last 7 and 30 days including today.
 */
export function rangeFor(preset: RangePreset, now: Date = new Date(), custom?: { from: string; to: string }): DateRange | null {
  switch (preset) {
    case 'today':
      return { start: toKhPosTime(startOfDay(now)), end: toKhPosTime(endOfDay(now)) };
    case 'yesterday': {
      const y = addDays(now, -1);
      return { start: toKhPosTime(startOfDay(y)), end: toKhPosTime(endOfDay(y)) };
    }
    case 'week':
      return { start: toKhPosTime(startOfDay(addDays(now, -6))), end: toKhPosTime(endOfDay(now)) };
    case 'month':
      return { start: toKhPosTime(startOfDay(addDays(now, -29))), end: toKhPosTime(endOfDay(now)) };
    case 'custom': {
      const from = parseDay(custom?.from ?? '');
      const to = parseDay(custom?.to ?? '');
      if (!from || !to || from > to) return null;
      return { start: toKhPosTime(startOfDay(from)), end: toKhPosTime(endOfDay(to)) };
    }
  }
}
