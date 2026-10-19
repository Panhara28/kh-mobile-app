/** Cinema producer settlement like the kh-pos web page: what each movie owes its producer, and marking it paid with proof. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export interface SettlementRow {
  id: string;
  movieId: string | null;
  totalAmount: number;
  shareAmount: number;
  createdAt: string | null;
  settledAt: string | null;
  proofLink: string | null;
  productVariant?: { name?: string | null; basicProduct?: { title?: string | null } | null } | null;
}

export interface SettlementDetail extends SettlementRow {
  showtimes?: { showtimeId: string; showDate: string; startTime: string; hall?: { name?: string } | null }[];
}

export type SettleFilter = 'all' | 'open' | 'settled';
export const SETTLE_FILTERS: SettleFilter[] = ['all', 'open', 'settled'];

export const isSettled = (r: Pick<SettlementRow, 'settledAt'>) => !!r.settledAt;

export function movieOf(r: Pick<SettlementRow, 'productVariant'>): string {
  const v = r.productVariant;
  if (!v) return '?';
  const title = v.basicProduct?.title ?? '';
  const variant = v.name && v.name !== 'ns' ? v.name : '';
  return [title, variant && title ? `(${variant})` : variant].filter(Boolean).join(' ') || '?';
}

export function settlementQuery(f: { filter: SettleFilter; limit: number; offset: number }): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.filter === 'open') q.set('isSettled', 'false');
  if (f.filter === 'settled') q.set('isSettled', 'true');
  return q.toString();
}

/** What is still owed (open settlements) and what was already paid out. */
export function owedTotals(rows: SettlementRow[]) {
  const open = rows.filter((r) => !isSettled(r)).reduce((s, r) => s + n(r.shareAmount), 0);
  const paid = rows.filter(isSettled).reduce((s, r) => s + n(r.shareAmount), 0);
  return { open: cents(open), paid: cents(paid) };
}

/** Generating covers whole days: from the start of the first to the end of the last. */
export function generateBody(range: { start: string; end: string }) {
  return { startDate: range.start.slice(0, 10), endDate: range.end.slice(0, 10) };
}

/** Marking settled needs the proof's link (a photo uploaded first). */
export function settleBody(settlementId: string, proofLink: string | null | undefined) {
  const link = (proofLink ?? '').trim();
  return link ? { settlementId, proofLink: link } : null;
}
