import { clampInt } from './number';

describe('clampInt (typed quantities and guest counts)', () => {
  it('reads typed numbers and keeps them in range', () => {
    expect(clampInt('25', 0, 999, 1)).toBe(25);
    expect(clampInt('0', 1, 999, 3)).toBe(1);
    expect(clampInt('5000', 0, 999, 1)).toBe(999);
    expect(clampInt('007', 0, 999, 1)).toBe(7);
  });

  it('falls back to the previous value when nothing valid was typed', () => {
    expect(clampInt('', 0, 999, 4)).toBe(4);
    expect(clampInt('abc', 1, 10, 0)).toBe(1);
  });
});
