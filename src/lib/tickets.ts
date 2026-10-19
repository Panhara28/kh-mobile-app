/** Cinema ticket reservations like the kh-pos web Ticket page: see them and admit people at the door. */

export type ReservationStatus = 'pending' | 'confirmed' | 'admitted' | 'cancelled' | 'expired';
export const RESERVATION_STATUSES: ReservationStatus[] = ['confirmed', 'admitted', 'pending', 'cancelled', 'expired'];

export interface ReservationRow {
  id: string;
  showtimeId: string;
  status: ReservationStatus;
  price: number;
  code?: string | null;
  createdAt?: string;
  admittedAt?: string;
  seat?: { row?: string | number; column?: number; type?: string } | null;
  showtime?: { startTime?: string; hall?: { name?: string } | null; variant?: { name?: string | null; basicProduct?: { title?: string | null } | null }[] | null } | null;
}

/** "C7" from the seat's row and column. */
export function seatLabel(r: Pick<ReservationRow, 'seat'>): string {
  const s = r.seat;
  if (!s || s.row === undefined || s.row === null) return '?';
  return `${s.row}${s.column ?? ''}`;
}

export function filmName(r: Pick<ReservationRow, 'showtime'>): string {
  const v = r.showtime?.variant?.[0];
  if (!v) return '?';
  const title = v.basicProduct?.title ?? '';
  const variant = v.name && v.name !== 'ns' ? v.name : '';
  return [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?';
}

/** Only a confirmed ticket can be admitted, as kh-pos allows. */
export const canAdmit = (r: Pick<ReservationRow, 'status'>) => r.status === 'confirmed';

export const admitBody = (r: Pick<ReservationRow, 'code'>) => ({ status: 'admitted' as const, code: r.code ?? '' });

/** The reservation a scanned or typed ticket code belongs to (ignoring case and spaces). */
export function matchCode(rows: ReservationRow[], code: string): ReservationRow | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  return rows.find((r) => r.code && r.code.trim().toLowerCase() === c) ?? null;
}

export function reservationQuery(f: { date?: string; status?: ReservationStatus; limit: number; offset: number }): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.date) q.set('date', f.date);
  if (f.status) q.set('status', f.status);
  return q.toString();
}

export function statusTone(s: ReservationStatus): 'success' | 'info' | 'warning' | 'destructive' | 'outline' | 'default' {
  if (s === 'admitted') return 'success';
  if (s === 'confirmed') return 'info';
  if (s === 'pending') return 'warning';
  if (s === 'cancelled' || s === 'expired') return 'destructive';
  return 'default';
}

/** How many tickets of each status are in the list. */
export function countByStatus(rows: Pick<ReservationRow, 'status'>[]): Record<ReservationStatus, number> {
  const out: Record<ReservationStatus, number> = { pending: 0, confirmed: 0, admitted: 0, cancelled: 0, expired: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/** Looking a ticket up by its code or by the customer's phone number (GET /api/cinema/reservation/code). */
export function lookupQuery(kind: 'code' | 'phone', text: string): string | null {
  const v = text.trim();
  if (!v) return null;
  return new URLSearchParams(kind === 'code' ? { code: v } : { customerPhone: v }).toString();
}
