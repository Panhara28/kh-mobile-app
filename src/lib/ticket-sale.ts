/** Selling cinema tickets like the kh-pos POS: pick a showtime and seats; the sale is an order whose movie line carries the seat reservations. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export type SeatType = 'standard' | 'vip' | 'couple' | 'wheelchair' | 'blocked';

export interface HallSeat {
  id: string;
  /** A letter: "A", "B", ... */
  row: string | number;
  column: number;
  type: SeatType;
  groupId?: string | null;
}

export interface SaleShowtime {
  showtimeId: string;
  movieId: string;
  showDate: string;
  startTime: string;
  basePrice: number;
  status: string;
  hall?: { name?: string; rows?: number; columns?: number; seats?: HallSeat[] } | null;
  /** Seats already taken. */
  reservations?: { seatId: string }[] | null;
  pricingTemplate?: { extraSeatPrices?: Record<string, number> | null } | null;
  variant?: { id?: string; name?: string | null; basicProduct?: { title?: string | null } | null }[] | null;
}

/** A showtime can be sold while it is scheduled or selling. */
export const canSell = (s: Pick<SaleShowtime, 'status'>) => s.status === 'selling' || s.status === 'scheduled';

export const seatLabel = (s: Pick<HallSeat, 'row' | 'column'>) => `${s.row}${s.column}`;

/** Row letters in order, each with its seats ordered by column (missing positions stay empty). */
export function seatGrid(seats: HallSeat[]): { row: string; cells: (HallSeat | null)[] }[] {
  const rows = [...new Set(seats.map((s) => String(s.row)))].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const maxCol = Math.max(0, ...seats.map((s) => s.column));
  return rows.map((row) => {
    const cells: (HallSeat | null)[] = Array.from({ length: maxCol }, () => null);
    for (const s of seats) if (String(s.row) === row && s.column >= 1) cells[s.column - 1] = s;
    return { row, cells };
  });
}

/** Base price plus the pricing template's extra for the seat's type. */
export function seatPrice(s: Pick<SaleShowtime, 'basePrice' | 'pricingTemplate'>, seat: Pick<HallSeat, 'type'>): number {
  return cents(n(s.basePrice) + n(s.pricingTemplate?.extraSeatPrices?.[seat.type]));
}

/** A seat can be chosen when it is not blocked and not already taken. */
export const isFree = (seat: HallSeat, taken: Set<string>) => seat.type !== 'blocked' && !taken.has(seat.id);

/** Tapping a seat: select or deselect it; a couple seat takes its partner along when the partner is free. */
export function toggleSeat(selected: string[], seatId: string, seats: HallSeat[], taken: Set<string>): string[] {
  const seat = seats.find((s) => s.id === seatId);
  if (!seat || !isFree(seat, taken)) return selected;
  const partner = seat.type === 'couple' && seat.groupId ? seats.find((s) => s.id === seat.groupId) : undefined;
  if (selected.includes(seatId)) return selected.filter((id) => id !== seatId && id !== partner?.id);
  const next = [...selected, seatId];
  if (partner && isFree(partner, taken) && !next.includes(partner.id)) next.push(partner.id);
  return next;
}

/** A short random code for a ticket (what the QR holds), like kh-pos's nanoid(7). */
export function ticketCode(random: () => number, size = 7): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < size; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}

export interface TicketLine {
  id: string;
  variantId: string;
  qty: number;
  price: string;
  reservation: { showtimeId: string; seatId: string; price: number; code: string }[];
}

/**
 * The order line for the chosen seats: one line for the movie, quantity = seats, with the price per
 * seat on each reservation. The line's own price is the average so that price × quantity equals
 * the seats' total.
 */
export function ticketLine(showtime: SaleShowtime, selected: string[], newId: () => string, code: () => string): TicketLine | null {
  const seats = showtime.hall?.seats ?? [];
  const chosen = selected.map((id) => seats.find((s) => s.id === id)).filter((s): s is HallSeat => !!s);
  if (chosen.length === 0) return null;
  const reservation = chosen.map((seat) => ({ showtimeId: showtime.showtimeId, seatId: seat.id, price: seatPrice(showtime, seat), code: code() }));
  const total = reservation.reduce((sum, r) => sum + r.price, 0);
  return { id: newId(), variantId: showtime.movieId, qty: reservation.length, price: String(total / reservation.length), reservation };
}

export const ticketsTotal = (selected: string[], showtime: SaleShowtime) => cents(selected.reduce((sum, id) => sum + seatPrice(showtime, showtime.hall?.seats?.find((s) => s.id === id) ?? { type: 'standard' as SeatType }), 0));

export const takenSeats = (s: Pick<SaleShowtime, 'reservations'>) => new Set((s.reservations ?? []).map((r) => r.seatId));
