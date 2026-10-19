import { canSell, isFree, seatGrid, seatLabel, seatPrice, takenSeats, ticketCode, ticketLine, ticketsTotal, toggleSeat, type HallSeat, type SaleShowtime } from './ticket-sale';

const seats: HallSeat[] = [
  { id: 'a1', row: 'A', column: 1, type: 'standard' },
  { id: 'a2', row: 'A', column: 2, type: 'vip' },
  { id: 'b1', row: 'B', column: 1, type: 'couple', groupId: 'b2' },
  { id: 'b2', row: 'B', column: 2, type: 'couple', groupId: 'b1' },
  { id: 'b4', row: 'B', column: 4, type: 'blocked' },
];
const showtime: SaleShowtime = { showtimeId: 'st', movieId: 'mv', showDate: '2026-10-19', startTime: '2026-10-19 19:30:00', basePrice: 5, status: 'selling', hall: { name: 'H1', seats }, reservations: [{ seatId: 'a1' }], pricingTemplate: { extraSeatPrices: { vip: 2, couple: 3 } } };

describe('the seat map', () => {
  it('orders rows and leaves gaps empty', () => {
    const grid = seatGrid(seats);
    expect(grid.map((r) => r.row)).toEqual(['A', 'B']);
    expect(grid[1]!.cells.map((c) => c?.id ?? null)).toEqual(['b1', 'b2', null, 'b4']);
    expect(seatLabel(seats[0]!)).toBe('A1');
  });
  it('prices a seat by its type and knows what is free', () => {
    expect(seatPrice(showtime, seats[0]!)).toBe(5);
    expect(seatPrice(showtime, seats[1]!)).toBe(7);
    expect(seatPrice({ basePrice: 5 }, seats[1]!)).toBe(5);
    const taken = takenSeats(showtime);
    expect(isFree(seats[0]!, taken)).toBe(false);
    expect(isFree(seats[4]!, taken)).toBe(false);
    expect(isFree(seats[1]!, taken)).toBe(true);
    expect(canSell(showtime)).toBe(true);
    expect(canSell({ status: 'ended' })).toBe(false);
  });
});

describe('choosing seats', () => {
  const taken = takenSeats(showtime);
  it('selects and deselects, ignoring taken or blocked seats', () => {
    expect(toggleSeat([], 'a2', seats, taken)).toEqual(['a2']);
    expect(toggleSeat(['a2'], 'a2', seats, taken)).toEqual([]);
    expect(toggleSeat([], 'a1', seats, taken)).toEqual([]);
    expect(toggleSeat([], 'b4', seats, taken)).toEqual([]);
  });
  it('a couple seat brings its partner, both ways', () => {
    expect(toggleSeat([], 'b1', seats, taken)).toEqual(['b1', 'b2']);
    expect(toggleSeat(['b1', 'b2'], 'b2', seats, taken)).toEqual([]);
    expect(toggleSeat([], 'b1', seats, new Set(['b2']))).toEqual(['b1']);
  });
});

describe('the order line', () => {
  it('has one line for the movie with a reservation per seat', () => {
    let k = 0;
    const line = ticketLine(showtime, ['a2', 'b1', 'b2'], () => 'line', () => `C${++k}`)!;
    expect(line).toMatchObject({ id: 'line', variantId: 'mv', qty: 3 });
    expect(line.reservation).toEqual([
      { showtimeId: 'st', seatId: 'a2', price: 7, code: 'C1' },
      { showtimeId: 'st', seatId: 'b1', price: 8, code: 'C2' },
      { showtimeId: 'st', seatId: 'b2', price: 8, code: 'C3' },
    ]);
    expect(Number(line.price) * line.qty).toBeCloseTo(23, 6);
    expect(ticketsTotal(['a2', 'b1', 'b2'], showtime)).toBe(23);
    expect(ticketLine(showtime, [], () => 'x', () => 'c')).toBeNull();
  });
  it('makes short codes from the alphabet', () => {
    const code = ticketCode(() => 0.5);
    expect(code).toHaveLength(7);
    expect(ticketCode(() => 0)).toBe('AAAAAAA');
    expect(ticketCode(() => 0.9999999)).toBe('9999999');
  });
});
