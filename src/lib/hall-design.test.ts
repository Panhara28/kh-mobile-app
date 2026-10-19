import { designOf, emptyHall, filled, hallBody, keyOf, paint, resize, seatCount, seatsBody, usableCount, validateHall, type HallInfo, type SeatMap } from './hall-design';

let k = 0;
const id = () => `n${++k}`;

describe('painting seats', () => {
  it('fills a room with standard seats', () => {
    k = 0;
    const s = filled(2, 3, id);
    expect(seatCount(s)).toBe(6);
    expect(s[keyOf(2, 3)]).toEqual({ id: 'n6', type: 'standard' });
  });
  it('paints a cell, keeping the seat id when repainting', () => {
    k = 0;
    let s: SeatMap = {};
    s = paint(s, 5, 5, 1, 1, 'vip', id);
    expect(s['1,1']).toEqual({ id: 'n1', type: 'vip' });
    s = paint(s, 5, 5, 1, 1, 'blocked', id);
    expect(s['1,1']).toEqual({ id: 'n1', type: 'blocked' });
    expect(paint(s, 5, 5, 9, 1, 'vip', id)).toBe(s);
  });
  it('couple seats come in pairs with the cell to the right, and erasing one frees the other', () => {
    k = 0;
    let s = paint({}, 5, 5, 2, 2, 'couple', id);
    expect(s['2,2']).toMatchObject({ type: 'couple', groupId: s['2,3']!.id });
    expect(s['2,3']).toMatchObject({ type: 'couple', groupId: s['2,2']!.id });
    expect(paint({}, 5, 5, 2, 5, 'couple', id)).toEqual({});
    s = paint(s, 5, 5, 2, 2, 'erase', id);
    expect(s['2,2']).toBeUndefined();
    expect(s['2,3']).toEqual({ id: expect.any(String), type: 'standard' });
  });
  it('shrinking the room drops the seats outside it', () => {
    k = 0;
    const s = resize(filled(3, 3, id), 2, 2);
    expect(Object.keys(s).sort()).toEqual(['1,1', '1,2', '2,1', '2,2']);
    const pair = paint({}, 5, 5, 1, 2, 'couple', id);
    expect(resize(pair, 5, 2)['1,2']).toEqual({ id: pair['1,2']!.id, type: 'standard' });
    expect(usableCount({ a: { id: 'a', type: 'blocked' }, b: { id: 'b', type: 'vip' } })).toBe(1);
  });
});

describe('saving a hall', () => {
  const info: HallInfo = { id: 'h', name: 'Hall 1', number: 1, rows: 2, columns: 2, status: 'active', seats: [{ id: 's1', row: 'A', column: 1, type: 'standard' }, { id: 's2', row: 'B', column: 2, type: 'vip', groupId: null }], features: { visual: { imax: true } }, parts: [{ id: 'p' }] };
  it('keeps seat ids when editing', () => {
    const d = designOf(info);
    expect(d.seats['1,1']!.id).toBe('s1');
    expect(d.seats['2,2']).toEqual({ id: 's2', type: 'vip' });
    expect(seatsBody(d.seats)).toEqual([{ id: 's1', row: 1, column: 1, type: 'standard' }, { id: 's2', row: 2, column: 2, type: 'vip' }]);
  });
  it('checks the hall', () => {
    const ok = { ...emptyHall(), name: 'H', seats: { '1,1': { id: 'a', type: 'standard' as const } } };
    expect(validateHall(ok)).toBeNull();
    expect(validateHall({ ...ok, name: ' ' })).toBe('name');
    expect(validateHall({ ...ok, number: 0 })).toBe('number');
    expect(validateHall({ ...ok, rows: 27 })).toBe('rows');
    expect(validateHall({ ...ok, columns: 41 })).toBe('columns');
    expect(validateHall({ ...ok, seats: {} })).toBe('seats');
  });
  it('builds the body, with features as text and the old features and parts kept', () => {
    const d = designOf(info);
    const body = hallBody({ ...d, name: ' Hall 1 ' }, info.features, info.parts ?? [], 'h');
    expect(body).toMatchObject({ hallId: 'h', name: 'Hall 1', number: 1, rows: 2, columns: 2, status: 'active', features: '{"visual":{"imax":true}}', parts: [{ id: 'p' }] });
    expect('hallId' in hallBody(d, null, [])).toBe(false);
    expect(hallBody(d, null, []).features).toBe('{}');
  });
});
