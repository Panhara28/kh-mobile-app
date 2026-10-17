import { clock, elapsed, parseKhPosTime } from './time';

describe('kh-pos times', () => {
  it('reads both kh-pos formats as local time', () => {
    expect(parseKhPosTime('2026-10-17 23:13:46')).toEqual(new Date(2026, 9, 17, 23, 13, 46));
    expect(parseKhPosTime('2026-10-17 23:14')).toEqual(new Date(2026, 9, 17, 23, 14, 0));
    expect(parseKhPosTime(null)).toBeNull();
    expect(parseKhPosTime('soon')).toBeNull();
  });

  it('shows a clock time, with the date when it is not today', () => {
    const now = new Date(2026, 9, 17, 23, 40);
    expect(clock(new Date(2026, 9, 17, 9, 5), now)).toBe('09:05');
    expect(clock(new Date(2026, 9, 16, 23, 59), now)).toBe('16/10 23:59');
  });

  it('measures how long ago', () => {
    const now = new Date(2026, 9, 17, 23, 40);
    expect(elapsed(new Date(2026, 9, 17, 23, 39, 30), now)).toEqual({ kind: 'now' });
    expect(elapsed(new Date(2026, 9, 17, 23, 28), now)).toEqual({ kind: 'min', min: 12 });
    expect(elapsed(new Date(2026, 9, 17, 21, 35), now)).toEqual({ kind: 'hour', h: 2, min: 5 });
    expect(elapsed(new Date(2026, 9, 17, 23, 45), now)).toEqual({ kind: 'now' }); // phone clock slightly behind
  });
});
