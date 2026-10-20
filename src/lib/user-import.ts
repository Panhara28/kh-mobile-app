import type { Cell } from './product-import';

/** Users from an Excel sheet, like the kh-pos web "Upload Excel" on the User page: the same columns, checks and request. */

export const USER_REQUIRED_HEADERS = ['Full Name', 'Username', 'Phone Number', 'Position', 'Profile'] as const;

/** What POST /api/upload-excel/user takes for each row. */
export interface UserExcelRow {
  fullName: string;
  username: string;
  phoneNumber: string;
  /** The role name; kh-pos looks it up (a name it does not know is not a role of this branch). */
  position: string;
  profile: string;
}

/** The password kh-pos gives every user made this way. */
export const UPLOAD_PASSWORD = '123456';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const str = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim());

/** The web accepts only .xlsx / .xls files up to 10 MB. */
export function fileProblem(name: string, size: number | undefined): string | null {
  const lower = name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) return 'File must be an Excel file (.xlsx or .xls)';
  if (size !== undefined && size > MAX_FILE_BYTES) return 'File size must be less than 10MB';
  return null;
}

/** Reads the first sheet (header row first). All five headers must be there; empty rows are skipped. */
export function parseUserSheet(rows: Cell[][]): { errors: string[]; data: UserExcelRow[] } {
  const header = rows[0];
  if (!header || header.every((c) => str(c) === '')) return { errors: ['Excel file must have a header row'], data: [] };
  const names = header.map(str);
  const missing = USER_REQUIRED_HEADERS.filter((h) => !names.includes(h));
  if (missing.length > 0) return { errors: [`Missing required headers: ${missing.join(', ')}`], data: [] };
  const at = (r: Cell[], h: string) => str(r[names.indexOf(h)]);
  const data: UserExcelRow[] = [];
  for (const r of rows.slice(1)) {
    if (!r || r.every((c) => str(c) === '')) continue;
    data.push({ fullName: at(r, 'Full Name'), username: at(r, 'Username'), phoneNumber: at(r, 'Phone Number'), position: at(r, 'Position'), profile: at(r, 'Profile') });
  }
  if (data.length === 0) return { errors: ['The sheet has no user rows'], data: [] };
  return { errors: [], data };
}

/** Rows kh-pos would make useless accounts from, shown before sending (the web sends them anyway). */
export function userRowWarnings(data: UserExcelRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  data.forEach((r, i) => {
    const row = i + 2;
    if (!r.username) out.push(`Row ${row}: no Username`);
    else if (seen.has(r.username.toLowerCase())) out.push(`Row ${row}: Username ${r.username} is repeated`);
    else seen.add(r.username.toLowerCase());
    if (!r.fullName) out.push(`Row ${row}: no Full Name`);
    if (!r.position) out.push(`Row ${row}: no Position`);
  });
  return out;
}

export const userUploadBody = (data: UserExcelRow[]) => ({ data });
