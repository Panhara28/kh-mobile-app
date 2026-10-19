/** Board-member dashboard: sales per branch (and per integrated brand), from GET /api/report/warehouse/sale. */

export interface BoardWarehouse {
  total_amount: string;
  warehouse_id: string;
  warehouse?: { id?: string; name?: string; isMain?: boolean; address?: string | null } | null;
}

export interface BoardResult {
  local?: BoardWarehouse[];
  /** `data` is null when an integrated brand could not be reached. */
  integration?: { name: string; data: BoardWarehouse[] | null }[];
}

export interface BoardRow {
  key: string;
  name: string;
  brand: string;
  isMain: boolean;
  /** kh-pos sends the amount already formatted ("$1,234.50"), so it is shown as it came. */
  text: string;
  value: number;
}

/** The number inside a formatted amount: "$1,234.50" → 1234.5, "៛12,000" → 12000. Unreadable → 0. */
export function parseAmount(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

/** Local branches first, then each brand's branches, each group biggest sale first. */
export function boardRows(result: BoardResult | null | undefined): { rows: BoardRow[]; unreachable: string[] } {
  const toRow = (w: BoardWarehouse, brand: string): BoardRow => ({ key: `${brand}:${w.warehouse_id}`, name: w.warehouse?.name ?? '?', brand, isMain: !!w.warehouse?.isMain, text: w.total_amount, value: parseAmount(w.total_amount) });
  const byValue = (a: BoardRow, b: BoardRow) => b.value - a.value;
  const rows = (result?.local ?? []).map((w) => toRow(w, '')).sort(byValue);
  const unreachable: string[] = [];
  for (const g of result?.integration ?? []) {
    if (!g.data) {
      unreachable.push(g.name);
      continue;
    }
    rows.push(...g.data.map((w) => toRow(w, g.name)).sort(byValue));
  }
  return { rows, unreachable };
}

/** The sum of the local branches (brands may use another currency, so they are not added in). */
export const localTotal = (rows: BoardRow[]) => Math.round(rows.filter((r) => !r.brand).reduce((s, r) => s + r.value, 0) * 100) / 100;
