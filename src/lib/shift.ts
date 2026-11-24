import type { RestaurantTable, Shift, ShiftReceipt } from './api';
import { openGroups } from './table-groups';
import { parseKhPosTime, toKhPosTime } from './time';
import type { CloseShiftPayload, OpenShiftPayload, OutboxCommand } from './offline/types';

/** The saved summary of a shift: kh-pos keeps it as JSON (an object, or text for a closed shift). */
export function receiptOf(shift: Shift | null | undefined): ShiftReceipt | null {
  const r = shift?.receipt;
  if (!r) return null;
  if (typeof r === 'string') {
    try {
      return JSON.parse(r) as ShiftReceipt;
    } catch {
      return null;
    }
  }
  return r;
}

/**
 * The shift the staff member works in, like the web (GET /api/shift/current, ShiftService.getWorkingShift): their own
 * OPEN shift, otherwise the branch's open shift (a branch has one shift open at a time, whoever opened it).
 */
export function currentShift(shifts: Shift[], userId: string | null | undefined): Shift | null {
  if (!userId) return null;
  const open = shifts.filter((s) => s.status === 'OPEN');
  return open.find((s) => s.opened_by?.id === userId) ?? open[0] ?? null;
}

/** The shift as it will be once opening or closing done offline has reached kh-pos. */
export function applyShiftCommands(
  current: Shift | null,
  commands: OutboxCommand[],
  user: { id: string; fullname?: string | null; username?: string | null },
): (Shift & { localOnly?: boolean }) | null {
  let shift: (Shift & { localOnly?: boolean }) | null = current;
  for (const c of commands) {
    if (c.status !== 'pending') continue;
    if (c.kind === 'openShift') {
      const p = c.payload as OpenShiftPayload;
      shift = {
        shift_id: `local:${c.id}`,
        status: 'OPEN',
        opened_at: toKhPosTime(new Date(c.createdAt)),
        closed_at: null,
        opened_cash_usd: String(p.openedCashUsd),
        opened_cash_khr: String(p.openedCashKhr),
        exchange_rate: String(p.exchangeRate),
        opened_by: { id: user.id, fullname: user.fullname, username: user.username },
        receipt: null,
        localOnly: true,
      };
    } else if (c.kind === 'closeShift') {
      void (c.payload as CloseShiftPayload);
      shift = null;
    }
  }
  return shift;
}

/** Cash the till should hold when closing, from the shift's live summary (kh-pos works it out). */
export function expectedCash(shift: Shift | null): { usd: number; khr: number } {
  const r = receiptOf(shift);
  if (r) return { usd: Number(r.closedCashUsd) || 0, khr: Number(r.closedCashKhr) || 0 };
  return { usd: Number(shift?.opened_cash_usd) || 0, khr: Number(shift?.opened_cash_khr) || 0 };
}

/** What is counted minus what is expected: positive is extra cash, negative is missing. */
export function cashDifference(actual: { usd: number; khr: number }, expected: { usd: number; khr: number }) {
  const round = (n: number) => Math.round(n * 100) / 100;
  return { usd: round(actual.usd - expected.usd), khr: round(actual.khr - expected.khr) };
}

// ---- the Shift page of the web app: list, details, close check and print ----

export const SHIFT_PAGE = 30;

const num = (v: unknown) => Number(v) || 0;

/** Cash counted when closing differs from the expected cash by more than a cent (USD) or one riel (KHR): the web warns. */
export function hasDiscrepancy(counted: { usd: number; khr: number }, expected: { usd: number; khr: number }): { usd: boolean; khr: boolean; any: boolean } {
  const usd = Math.abs(counted.usd - expected.usd) > 0.01;
  const khr = Math.abs(counted.khr - expected.khr) > 1;
  return { usd, khr, any: usd || khr };
}

/** "Actual - Expected" of a closed shift, as the details dialog shows it. */
export function variance(shift: Pick<Shift, 'actual_cash_usd' | 'actual_cash_khr' | 'closed_cash_usd' | 'closed_cash_khr'>): { usd: number; khr: number } {
  return { usd: num(shift.actual_cash_usd) - num(shift.closed_cash_usd), khr: num(shift.actual_cash_khr) - num(shift.closed_cash_khr) };
}

/** "3 hours" (one hour or more) or "40 minutes", "N/A" when a time is missing. */
export function durationText(openedAt: string | null | undefined, closedAt: string | null | undefined): string {
  const a = parseKhPosTime(openedAt);
  const b = parseKhPosTime(closedAt);
  if (!a || !b) return 'N/A';
  const ms = b.getTime() - a.getTime();
  return ms / 3600000 >= 1 ? `${Math.floor(ms / 3600000)} hours` : `${Math.floor(ms / 60000)} minutes`;
}

/** Card payments (everything but CASH): how many slips. */
export function cardSlips(r: Pick<ShiftReceipt, 'amountByMethod'> | null | undefined): number {
  return Object.entries(r?.amountByMethod ?? {})
    .filter(([m]) => m !== 'CASH')
    .reduce((a, [, v]) => a + num(v?.qty), 0);
}

/** The "May 05, 2026 14:30" the details dialog shows. */
export function shiftDateTime(value: string | null | undefined): string {
  const d = parseKhPosTime(value);
  if (!d) return 'N/A';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${p(d.getDate())}, ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface ShiftLine {
  label: string;
  value: string;
  bold?: boolean;
  /** A heading row, no value. */
  heading?: boolean;
}

export interface ShiftLabels {
  title: string;
  handover: string;
  opening: string;
  closing: string;
  actual: string;
  difference: string;
  handoverAmount: string;
  paymentMethod: string;
  sales: string;
  returns: string;
  bills: string;
  customers: string;
  openedBy: string;
  openedAt: string;
  closedAt: string;
}

/** The handover receipt of a shift: cash in both currencies, payments per method, sales and returns. */
export function shiftLines(shift: Shift, usd: (v: number) => string, khr: (v: number) => string, l: ShiftLabels): ShiftLine[] {
  const r = receiptOf(shift);
  const out: ShiftLine[] = [
    { label: l.openedBy, value: shift.opened_by?.fullname || shift.opened_by?.username || '-' },
    { label: l.openedAt, value: shiftDateTime(shift.opened_at) },
    { label: l.closedAt, value: shift.closed_at ? shiftDateTime(shift.closed_at) : '-' },
    { label: l.handover, value: '', heading: true },
    { label: `${l.opening} (USD)`, value: usd(num(shift.opened_cash_usd)) },
    { label: `${l.closing} (USD)`, value: usd(num(shift.closed_cash_usd)) },
    { label: `${l.actual} (USD)`, value: usd(num(shift.actual_cash_usd)) },
    { label: `${l.difference} (USD)`, value: usd(variance(shift).usd) },
    { label: `${l.opening} (KHR)`, value: khr(num(shift.opened_cash_khr)) },
    { label: `${l.closing} (KHR)`, value: khr(num(shift.closed_cash_khr)) },
    { label: `${l.actual} (KHR)`, value: khr(num(shift.actual_cash_khr)) },
    { label: `${l.difference} (KHR)`, value: khr(variance(shift).khr) },
    { label: l.handoverAmount, value: `${usd(num(shift.actual_cash_usd))} · ${khr(num(shift.actual_cash_khr))}`, bold: true },
  ];
  if (r) {
    out.push({ label: l.paymentMethod, value: String(r.payments ?? 0), heading: true });
    for (const [m, v] of Object.entries(r.amountByMethod ?? {})) out.push({ label: `${m} (${num(v.qty)})`, value: `${usd(num(v.usd))} · ${khr(num(v.khr))}` });
    out.push({ label: l.sales, value: usd(num(r.sales)), bold: true });
    out.push({ label: l.returns, value: usd(num(r.amountReturned)) });
    out.push({ label: l.bills, value: String(r.orders ?? 0) });
    out.push({ label: l.customers, value: String(r.totalCustomer ?? 0) });
  }
  return out;
}

export function shiftReceiptText(title: string, lines: ShiftLine[]): string {
  return [title, '', ...lines.map((x) => (x.heading ? `\n${x.label.toUpperCase()}` : `${x.label}: ${x.value}`))].join('\n');
}

export function shiftReceiptHtml(title: string, lines: ShiftLine[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = lines
    .map((x) => (x.heading ? `<tr><td colspan="2" style="padding-top:10px"><b>${esc(x.label.toUpperCase())}</b></td></tr>` : `<tr><td>${esc(x.label)}</td><td style="text-align:right">${x.bold ? '<b>' : ''}${esc(x.value)}${x.bold ? '</b>' : ''}</td></tr>`))
    .join('');
  return `<html><body style="font-family:sans-serif;font-size:14px"><h3 style="text-align:center">${esc(title)}</h3><table style="width:100%">${rows}</table></body></html>`;
}

/**
 * The orders still unpaid on the tables ("T-01", or "T-01 #002" for a Table + Tag group): closing the shift leaves
 * them open, so the cashier is warned before closing (paid in the next shift).
 */
export function unpaidOrders(tables: RestaurantTable[]): string[] {
  return tables.flatMap((t) => openGroups(t).map((o) => (o.tagNo ? `${t.table_name} #${o.tagNo}` : t.table_name)));
}
