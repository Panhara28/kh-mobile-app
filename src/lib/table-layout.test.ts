import { CANVAS_H, CANVAS_W, clamp, clearBody, defaultPosition, hasChanges, layoutBody, layoutOf, savedPositions, snap, TILE_H, TILE_W } from './table-layout';

describe('table positions', () => {
  it('reads the saved ones, ignoring missing or broken values', () => {
    expect(savedPositions([{ id: 'a', position_x: '120', position_y: '48.5' }, { id: 'b', position_x: null, position_y: '3' }, { id: 'c', position_x: 'x', position_y: '1' }, { id: 'd' }])).toEqual({ a: { x: 120, y: 48.5 } });
  });
  it('puts unplaced tables on a tidy grid and keeps the saved ones', () => {
    const l = layoutOf([{ id: 'a', position_x: '300', position_y: '200' }, { id: 'b' }, { id: 'c' }]);
    expect(l.a).toEqual({ x: 300, y: 200 });
    expect(l.b).toEqual(defaultPosition(1));
    expect(l.c).toEqual(defaultPosition(2));
    expect(defaultPosition(0)).toEqual({ x: 12, y: 12 });
    expect(defaultPosition(10, 10)).toEqual({ x: 12, y: 12 + (TILE_H + 24) });
  });
  it('keeps a tile on the canvas and on the grid', () => {
    expect(clamp({ x: -50, y: 5000 })).toEqual({ x: 0, y: CANVAS_H - TILE_H });
    expect(clamp({ x: 9999, y: -1 })).toEqual({ x: CANVAS_W - TILE_W, y: 0 });
    expect(snap({ x: 17, y: 31 })).toEqual({ x: 12, y: 36 });
  });
});

describe('saving the plan', () => {
  const saved = { a: { x: 12, y: 12 } };
  const original = { a: { x: 12, y: 12 }, b: { x: 132, y: 12 } };
  it('sends tables that moved, and those never saved, as text', () => {
    const current = { a: { x: 12, y: 12 }, b: { x: 240, y: 96 } };
    expect(layoutBody(current, original, saved)).toEqual([{ id: 'b', positionX: '240', positionY: '96' }]);
    expect(layoutBody({ a: { x: 24, y: 12 }, b: original.b }, original, saved).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('knows if anything changed and builds the clear body', () => {
    expect(hasChanges(original, original)).toBe(false);
    expect(hasChanges({ ...original, b: { x: 0, y: 0 } }, original)).toBe(true);
    expect(clearBody(['a', 'b'])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});
