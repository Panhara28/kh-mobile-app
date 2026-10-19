import { admitBody, canAdmit, countByStatus, filmName, matchCode, reservationQuery, seatLabel, statusTone, type ReservationRow } from './tickets';

const r = (over: Partial<ReservationRow> = {}): ReservationRow => ({ id: 'r1', showtimeId: 's1', status: 'confirmed', price: 5, code: 'AB-12', seat: { row: 'C', column: 7 }, showtime: { variant: [{ name: 'ns', basicProduct: { title: 'Film' } }] }, ...over });

describe('tickets', () => {
  it('names the seat and the film', () => {
    expect(seatLabel(r())).toBe('C7');
    expect(seatLabel(r({ seat: null }))).toBe('?');
    expect(filmName(r())).toBe('Film');
    expect(filmName(r({ showtime: null }))).toBe('?');
  });
  it('only a confirmed ticket can be admitted, sending its code', () => {
    expect(canAdmit(r())).toBe(true);
    expect(canAdmit(r({ status: 'admitted' }))).toBe(false);
    expect(canAdmit(r({ status: 'cancelled' }))).toBe(false);
    expect(admitBody(r())).toEqual({ status: 'admitted', code: 'AB-12' });
    expect(admitBody(r({ code: null }))).toEqual({ status: 'admitted', code: '' });
  });
  it('finds a ticket by its scanned code', () => {
    const rows = [r(), r({ id: 'r2', code: 'ZZ-9' })];
    expect(matchCode(rows, ' ab-12 ')?.id).toBe('r1');
    expect(matchCode(rows, 'nope')).toBeNull();
    expect(matchCode(rows, '')).toBeNull();
  });
  it('counts, colours and builds the query', () => {
    expect(countByStatus([r(), r(), r({ status: 'admitted' })])).toEqual({ pending: 0, confirmed: 2, admitted: 1, cancelled: 0, expired: 0 });
    expect([statusTone('admitted'), statusTone('confirmed'), statusTone('pending'), statusTone('expired')]).toEqual(['success', 'info', 'warning', 'destructive']);
    expect(reservationQuery({ limit: 50, offset: 0 })).toBe('limit=50&offset=0');
    expect(reservationQuery({ date: '2026-10-19', status: 'confirmed', limit: 50, offset: 50 })).toBe('limit=50&offset=50&date=2026-10-19&status=confirmed');
  });
});
