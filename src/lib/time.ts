/**
 * kh-pos sends times as local branch time strings ("2026-10-17 23:13:46" or
 * "2026-10-17 23:14", Asia/Phnom_Penh). The phones are in the same place, so they are read as
 * phone-local time.
 */
export function parseKhPosTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "23:13" (same day) or "17/10 23:13". */
export function clock(date: Date, now: Date = new Date()): string {
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? hhmm : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
}

/** "2026-10-17 23:13", always with the date (as the web shows status changes). */
export function clockWithDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** "2026-10-17 23:13:46": a date in the format kh-pos sends (phone-local time, see parseKhPosTime). */
export function toKhPosTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${clockWithDate(date)}:${p(date.getSeconds())}`;
}

/** Waiting time split for display: under a minute, minutes, or hours and minutes. */
export function elapsed(date: Date, now: Date = new Date()): { kind: 'now' } | { kind: 'min'; min: number } | { kind: 'hour'; h: number; min: number } {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return { kind: 'now' };
  if (minutes < 60) return { kind: 'min', min: minutes };
  return { kind: 'hour', h: Math.floor(minutes / 60), min: minutes % 60 };
}
