import type { TFunction } from 'i18next';
import { clock, clockWithDate, elapsed, parseKhPosTime } from '@/lib/time';

/** "12 min", "2 h 5 min", "just now" (translated). */
export function agoLabel(t: TFunction, date: Date, now = new Date()): string {
  const e = elapsed(date, now);
  if (e.kind === 'now') return t('time.now');
  if (e.kind === 'min') return t('time.min', { min: e.min });
  return t('time.hour', { h: e.h, min: e.min });
}

/** "23:13 · 12 min" for a kh-pos time string, or null when there is none. */
export function addedLabel(t: TFunction, value: string | null | undefined, now = new Date()): string | null {
  const date = parseKhPosTime(value);
  return date ? t('time.addedAgo', { time: clock(date, now), ago: agoLabel(t, date, now) }) : null;
}

/** "ban · 2026-10-17 23:20" for a status change, like the web. */
export function byAtLabel(
  t: TFunction,
  by: { fullname?: string | null; username?: string | null } | null | undefined,
  value: string | null | undefined,
  now = new Date(),
): string | null {
  const date = parseKhPosTime(value);
  if (!date) return null;
  const who = by?.username || by?.fullname;
  const time = clockWithDate(date);
  return who ? t('time.byAt', { who, time }) : time;
}
