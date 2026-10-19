/** Cinema hall seat designer like the kh-pos web "Hall seat" page: size the room, then paint each seat's type. */

const n = (v: unknown) => Number(v) || 0;

export type SeatKind = 'standard' | 'vip' | 'couple' | 'wheelchair' | 'blocked';
export type Brush = SeatKind | 'erase';
export const BRUSHES: Brush[] = ['standard', 'vip', 'couple', 'wheelchair', 'blocked', 'erase'];
export type HallStatus = 'active' | 'maintenance' | 'inactive';
export const HALL_STATUSES: HallStatus[] = ['active', 'maintenance', 'inactive'];

export const MAX_ROWS = 26; // row labels are letters A-Z
export const MAX_COLUMNS = 40;

export interface DesignSeat {
  id: string;
  type: SeatKind;
  /** A couple seat's partner. */
  groupId?: string;
}

/** The seats by position: "row,column" (both 1-based). */
export type SeatMap = Record<string, DesignSeat>;
export const keyOf = (row: number, column: number) => `${row},${column}`;

export interface HallDesign {
  name: string;
  number: number;
  rows: number;
  columns: number;
  status: HallStatus;
  seats: SeatMap;
}

export interface HallInfo {
  id: string;
  name: string;
  number: number;
  rows: number;
  columns: number;
  status: HallStatus;
  seats: { id: string; row: string | number; column: number; type: SeatKind; groupId?: string | null }[];
  features?: unknown;
  parts?: unknown[];
}

const rowNumber = (row: string | number) => (typeof row === 'number' ? row : String(row).charCodeAt(0) - 64);

export const emptyHall = (): HallDesign => ({ name: '', number: 1, rows: 8, columns: 12, status: 'active', seats: {} });

/** A fresh hall filled with standard seats. */
export function filled(rows: number, columns: number, newId: () => string): SeatMap {
  const out: SeatMap = {};
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= columns; c++) out[keyOf(r, c)] = { id: newId(), type: 'standard' };
  return out;
}

/** The design of a hall the server sent; seat ids are kept so tickets already sold still point at their seats. */
export function designOf(h: HallInfo): HallDesign {
  const seats: SeatMap = {};
  const idToKey = new Map<string, string>();
  for (const s of h.seats) {
    const key = keyOf(rowNumber(s.row), s.column);
    seats[key] = { id: s.id, type: s.type, ...(s.groupId ? { groupId: s.groupId } : {}) };
    idToKey.set(s.id, key);
  }
  return { name: h.name, number: n(h.number), rows: n(h.rows), columns: n(h.columns), status: h.status, seats };
}

/** Removes a seat; a couple seat's partner becomes a standard seat. */
function removeAt(seats: SeatMap, key: string): SeatMap {
  const seat = seats[key];
  if (!seat) return seats;
  const next = { ...seats };
  delete next[key];
  if (seat.groupId) {
    const pk = Object.keys(next).find((k) => next[k]!.id === seat.groupId);
    if (pk) next[pk] = { id: next[pk]!.id, type: 'standard' };
  }
  return next;
}

/** Paints a cell. The couple brush makes a pair with the cell to the right, if that is inside the room. */
export function paint(seats: SeatMap, rows: number, columns: number, row: number, column: number, brush: Brush, newId: () => string): SeatMap {
  if (row < 1 || row > rows || column < 1 || column > columns) return seats;
  const key = keyOf(row, column);
  if (brush === 'erase') return removeAt(seats, key);
  let next = removeAt(seats, key);
  if (brush !== 'couple') return { ...next, [key]: { id: seats[key]?.id ?? newId(), type: brush } };
  if (column + 1 > columns) return seats;
  const rightKey = keyOf(row, column + 1);
  next = removeAt(next, rightKey);
  const a = seats[key]?.id ?? newId();
  const b = seats[rightKey]?.id ?? newId();
  return { ...next, [key]: { id: a, type: 'couple', groupId: b }, [rightKey]: { id: b, type: 'couple', groupId: a } };
}

/** Changing the room's size drops the seats outside it (a couple seat that loses its partner becomes standard). */
export function resize(seats: SeatMap, rows: number, columns: number): SeatMap {
  let out = seats;
  for (const key of Object.keys(seats)) {
    const [r, c] = key.split(',').map(Number) as [number, number];
    if (r > rows || c > columns) out = removeAt(out, key);
  }
  return out;
}

export function validateHall(d: HallDesign): 'name' | 'number' | 'rows' | 'columns' | 'seats' | null {
  if (!d.name.trim()) return 'name';
  if (!(n(d.number) >= 1)) return 'number';
  if (!(n(d.rows) >= 1 && n(d.rows) <= MAX_ROWS)) return 'rows';
  if (!(n(d.columns) >= 1 && n(d.columns) <= MAX_COLUMNS)) return 'columns';
  if (Object.keys(d.seats).length === 0) return 'seats';
  return null;
}

export const seatCount = (seats: SeatMap) => Object.keys(seats).length;
export const usableCount = (seats: SeatMap) => Object.values(seats).filter((s) => s.type !== 'blocked').length;

/** The seats in the form kh-pos wants: row as a number, ordered. */
export function seatsBody(seats: SeatMap) {
  return Object.entries(seats)
    .map(([key, s]) => {
      const [row, column] = key.split(',').map(Number) as [number, number];
      return { id: s.id, row, column, type: s.type, ...(s.groupId ? { groupId: s.groupId } : {}) };
    })
    .sort((a, b) => a.row - b.row || a.column - b.column);
}

/**
 * The body kh-pos wants. Features and parts (zones) are not edited on the phone: a hall being edited
 * keeps what it had, a new hall starts with none switched on.
 */
export function hallBody(d: HallDesign, features: unknown, parts: unknown[], hallId?: string) {
  return {
    ...(hallId ? { hallId } : {}),
    name: d.name.trim(),
    number: Math.floor(n(d.number)),
    rows: Math.floor(n(d.rows)),
    columns: Math.floor(n(d.columns)),
    features: JSON.stringify(features ?? {}),
    status: d.status,
    seats: seatsBody(d.seats),
    parts: parts ?? [],
  };
}

/** What kh-pos gives a new hall: every feature switched off. */
export const DEFAULT_FEATURES = {
  visual: { imax: false, '3d': false, '4dx': false, screenx: false, dolby_cinema: false, laser_projection: false },
  audio: { dolby_atmos: false, dts_x: false, thx_certified: false },
  seating: { recliners: false, dbox: false, beds: false },
  amenities: { in_seat_dining: false, vip_lounge: false, bar_service: false },
  specialty: { kids_cinema: false, adults_only: false, art_house: false },
};
