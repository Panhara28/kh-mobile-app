/** Table floor plan like the kh-pos web "table flow" page: each table has an x/y position on a canvas. */

export const TILE_W = 96;
export const TILE_H = 72;
export const CANVAS_W = 1200;
export const CANVAS_H = 1000;
/** Tiles snap to this grid so a plan stays tidy. */
export const GRID = 12;

export interface Point {
  x: number;
  y: number;
}

export interface PositionedTable {
  id: string;
  position_x?: string | null;
  position_y?: string | null;
}

/** The saved position of each table that has one (kh-pos stores them as text). */
export function savedPositions(tables: PositionedTable[]): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const t of tables) {
    if (t.position_x == null || t.position_y == null) continue;
    const x = parseFloat(t.position_x);
    const y = parseFloat(t.position_y);
    if (Number.isFinite(x) && Number.isFinite(y)) out[t.id] = { x, y };
  }
  return out;
}

/** Where a table without a saved position starts: a tidy grid, left to right then down. */
export function defaultPosition(index: number, perRow = Math.max(1, Math.floor(CANVAS_W / (TILE_W + 24)))): Point {
  return { x: 12 + (index % perRow) * (TILE_W + 24), y: 12 + Math.floor(index / perRow) * (TILE_H + 24) };
}

export const clamp = (p: Point): Point => ({ x: Math.min(Math.max(0, p.x), CANVAS_W - TILE_W), y: Math.min(Math.max(0, p.y), CANVAS_H - TILE_H) });

export const snap = (p: Point, grid = GRID): Point => ({ x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid });

/** Every table's position: the saved one, or the default for its place in the list. */
export function layoutOf(tables: PositionedTable[]): Record<string, Point> {
  const saved = savedPositions(tables);
  const out: Record<string, Point> = {};
  tables.forEach((t, i) => {
    out[t.id] = saved[t.id] ?? defaultPosition(i);
  });
  return out;
}

/** The body kh-pos wants: positions as text; only tables that moved (or all when none were saved yet). */
export function layoutBody(current: Record<string, Point>, original: Record<string, Point>, saved: Record<string, Point>) {
  return Object.keys(current)
    .filter((id) => !saved[id] || original[id]?.x !== current[id]!.x || original[id]?.y !== current[id]!.y)
    .map((id) => ({ id, positionX: String(current[id]!.x), positionY: String(current[id]!.y) }));
}

/** Clearing sends no position, which kh-pos stores as empty. */
export const clearBody = (ids: string[]) => ids.map((id) => ({ id }));

export const hasChanges = (current: Record<string, Point>, original: Record<string, Point>) => Object.keys(current).some((id) => original[id]?.x !== current[id]!.x || original[id]?.y !== current[id]!.y);
