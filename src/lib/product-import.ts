/** Product import from an Excel sheet, like the kh-pos web "Upload Excel": the same columns, the same checks, the same request. */

const n = (v: unknown) => Number(v) || 0;

export const REQUIRED_HEADERS = ['Code', 'Name', 'Price', 'Product Group'] as const;
export const OPTIONAL_HEADERS = ['RSP', 'Estimation GP', 'Stocks', 'Vendor Name'] as const;
export const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

/** What POST /api/upload-excel takes for each row. */
export interface ExcelRow {
  barcode: string;
  description: string;
  vendorName: string;
  cost: number;
  rsp: number;
  estimationGP: number;
  category: string;
  stocks: number;
}

export type Cell = string | number | boolean | Date | null | undefined;

const str = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Reads the first sheet as rows of cells (header row first). The header row must hold the required
 * columns; Code is the barcode, Name the product, Price the selling price (rsp), Product Group the
 * category; Cost, Estimation GP, Stocks and Vendor Name are read when present. Empty rows are skipped.
 */
export function parseSheet(rows: Cell[][]): { errors: string[]; data: ExcelRow[] } {
  const header = rows[0];
  if (!header || header.every((c) => str(c) === '')) return { errors: ['Excel file must have a header row'], data: [] };
  const names = header.map(str);
  const missing = REQUIRED_HEADERS.filter((h) => !names.includes(h));
  if (missing.length > 0) return { errors: [`Missing required headers: ${missing.join(', ')}`], data: [] };
  const col = (h: string) => names.indexOf(h);
  const at = (r: Cell[], h: string): Cell => (col(h) >= 0 ? r[col(h)] : undefined);

  const data: ExcelRow[] = [];
  for (const r of rows.slice(1)) {
    if (!r || r.every((c) => str(c) === '')) continue;
    data.push({
      barcode: str(at(r, 'Code')),
      description: str(at(r, 'Name')),
      vendorName: str(at(r, 'Vendor Name')),
      cost: n(at(r, 'Cost')),
      rsp: n(at(r, 'Price')),
      estimationGP: n(at(r, 'Estimation GP')),
      category: str(at(r, 'Product Group')),
      stocks: n(at(r, 'Stocks')),
    });
  }
  if (data.length === 0) return { errors: ['The sheet has no product rows'], data: [] };
  return { errors: [], data };
}

/** Rows that will probably be refused or are useless, so they can be shown before sending. */
export function rowWarnings(data: ExcelRow[]): string[] {
  const out: string[] = [];
  data.forEach((r, i) => {
    if (!r.description) out.push(`Row ${i + 2}: no Name`);
    else if (!r.barcode) out.push(`Row ${i + 2}: no Code`);
    else if (!r.category) out.push(`Row ${i + 2}: no Product Group`);
  });
  return out;
}

export const uploadBody = (data: ExcelRow[]) => ({ data });
