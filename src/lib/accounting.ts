/** Accounting like the kh-pos web pages: the chart of accounts (revenue / expense) and bookings against it. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export type AccountType = 'revenue' | 'expense';
export const ACCOUNT_TYPES: AccountType[] = ['revenue', 'expense'];

export interface AccountRow {
  id: string;
  accountName: string;
  accountType: AccountType;
  createdAt?: string;
}

export type AccountForm = {
  accountName: string;
  accountType: AccountType | '';
};

export const emptyAccount = (): AccountForm => ({ accountName: '', accountType: '' });
export const accountForm = (r: AccountRow): AccountForm => ({ accountName: r.accountName, accountType: r.accountType });

export function validateAccount(f: AccountForm): keyof AccountForm | null {
  if (!f.accountName.trim()) return 'accountName';
  if (f.accountType !== 'revenue' && f.accountType !== 'expense') return 'accountType';
  return null;
}

/** kh-pos names the fields in snake_case for accounts. */
export const accountBody = (f: AccountForm, existing?: AccountRow) => ({ ...(existing ? { id: existing.id } : {}), account_name: f.accountName.trim(), account_type: f.accountType });

export interface BookingRow {
  id: string;
  accountId: string;
  /** Negative for an expense: kh-pos stores it that way. */
  amount: number;
  description: string;
  createdAt: string | null;
  account?: { accountName?: string; accountType?: AccountType } | null;
}

export interface BookingSummary {
  total_amount: number | string | null;
  total_revenue: number | string | null;
  total_expense: number | string | null;
  total_count: number | string | null;
}

export interface BookingForm {
  bookingName: string;
  accountId: string;
  amount: number;
}

export const emptyBooking = (): BookingForm => ({ bookingName: '', accountId: '', amount: 0 });

export function validateBooking(f: BookingForm): keyof BookingForm | null {
  if (!f.bookingName.trim()) return 'bookingName';
  if (!f.accountId) return 'accountId';
  if (!(n(f.amount) > 0)) return 'amount';
  return null;
}

/** The amount is sent as a positive number: kh-pos makes it negative for expense accounts. */
export const bookingBody = (f: BookingForm) => ({ bookingName: f.bookingName.trim(), accountId: f.accountId, amount: Math.abs(n(f.amount)) });

/** What the summary says, as numbers: revenue, expense (shown positive) and what is left. */
export function summaryNumbers(s: BookingSummary | null | undefined) {
  const revenue = n(s?.total_revenue);
  const expense = Math.abs(n(s?.total_expense));
  return { revenue: cents(revenue), expense: cents(expense), net: cents(revenue - expense), count: n(s?.total_count) };
}

export function bookingQuery(f: { limit: number; offset: number; range?: { start: string; end: string } | null; type?: AccountType }): string {
  const q = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.range) {
    q.set('startDate', f.range.start);
    q.set('endDate', f.range.end);
  }
  if (f.type) q.set('accountType', f.type);
  return q.toString();
}

export const isExpense = (b: Pick<BookingRow, 'amount' | 'account'>) => b.account?.accountType === 'expense' || n(b.amount) < 0;
