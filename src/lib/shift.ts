import type { Shift, ShiftReceipt } from './api';
import { toKhPosTime } from './time';
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

/** The shift a cashier is working in: their own OPEN shift (the web's `currentShift`). */
export function currentShift(shifts: Shift[], userId: string | null | undefined): Shift | null {
  if (!userId) return null;
  return shifts.find((s) => s.status === 'OPEN' && s.opened_by?.id === userId) ?? null;
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
