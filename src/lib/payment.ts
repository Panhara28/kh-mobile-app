import type { CheckoutPayment } from './api';
import type { CurrencyCode } from './money';

/**
 * Payment lines at checkout, with the same arithmetic as the kh-pos web payment dialog
 * (src/components/gui/pos/pos-payment-dialog.tsx). A line is paid in USD or KHR; `amountUsd`
 * (kh-pos' name) is that amount in the branch's currency, which is what is compared with the
 * order total. Numbers are kept as the text typed, so a half-typed "12." is not disturbed.
 */
export interface PaymentDraft {
  /** kh-pos payment method id (empty until chosen). */
  paymentMethod: string;
  currency: 'USD' | 'KHR';
  amount: string;
  amountUsd: string;
}

export interface PaymentContext {
  /** The branch's currency (the order total is in it). */
  branchCurrency: CurrencyCode;
  /** KHR per 1 USD (setting EXCHANGE_RATE, 4100 when unset). */
  exchangeRate: number;
}

export const DEFAULT_EXCHANGE_RATE = 4100;

export function exchangeRateFrom(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EXCHANGE_RATE;
}

export const newPayment = (currency: 'USD' | 'KHR' = 'USD'): PaymentDraft => ({ paymentMethod: '', currency, amount: '0', amountUsd: '0' });

const num = (v: string) => Number(v) || 0;
const clean = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '0');

/** What the cashier typed in the amount box. */
export function setPaymentAmount(p: PaymentDraft, text: string, ctx: PaymentContext): PaymentDraft {
  const typed = num(text);
  const amountUsd = p.currency === 'USD' ? text : clean(ctx.branchCurrency === 'USD' ? typed / ctx.exchangeRate : typed * ctx.exchangeRate);
  return { ...p, amount: text, amountUsd };
}

/** Switching the line between USD and KHR converts what is already typed. */
export function setPaymentCurrency(p: PaymentDraft, currency: 'USD' | 'KHR', ctx: PaymentContext): PaymentDraft {
  if (p.currency === currency) return p;
  const cur = num(p.amount);
  const usdBranch = ctx.branchCurrency === 'USD';
  let next: number;
  if (p.currency === 'USD' && currency === 'KHR') next = usdBranch ? cur * ctx.exchangeRate : cur / ctx.exchangeRate;
  else next = usdBranch ? cur / ctx.exchangeRate : cur * ctx.exchangeRate;
  const amountUsd = currency === 'USD' ? next : usdBranch ? next / ctx.exchangeRate : next * ctx.exchangeRate;
  return { ...p, currency, amount: clean(next), amountUsd: clean(amountUsd) };
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function paymentTotals(payments: PaymentDraft[], total: number) {
  const received = payments.reduce((a, p) => a + num(p.amountUsd), 0);
  return {
    received,
    /** Still to pay, never negative. */
    remaining: Math.max(0, cents(total - received)),
    /** Money to give back when more than the total was received. */
    change: Math.max(0, cents(received - total)),
  };
}

/** Paid in full (to the cent) and every line has a method. */
export function canCompletePayment(payments: PaymentDraft[], total: number): boolean {
  if (payments.length === 0) return false;
  if (payments.some((p) => !p.paymentMethod)) return false;
  return cents(paymentTotals(payments, total).received) >= cents(total);
}

/** The lines as kh-pos wants them, with how much of each is used for the order (the rest is change). */
export function toCheckoutPayments(payments: PaymentDraft[], total: number, ctx: PaymentContext): CheckoutPayment[] {
  let remaining = total;
  return payments.map((p) => {
    const amountUsd = num(p.amountUsd);
    const used = Math.min(amountUsd, remaining);
    remaining = Math.max(0, remaining - amountUsd);
    return { amount: num(p.amount), paymentMethod: p.paymentMethod, currency: p.currency, amountUsd, exchangeRate: ctx.exchangeRate, used };
  });
}

/** The amount in the other currency, for the small "≈ ៛4,100" line under a total. */
export function otherCurrencyValue(value: number, branchCurrency: CurrencyCode, rate: number): { currency: 'USD' | 'KHR'; amount: number } {
  return branchCurrency === 'USD' ? { currency: 'KHR', amount: Math.round(value * rate) } : { currency: 'USD', amount: Math.round((value / rate) * 100) / 100 };
}

/** The whole order total: lines' totals (kh-pos has already applied discounts and options). */
export function orderTotal(items: { totalAmount: string | number }[]): number {
  return cents(items.reduce((a, l) => a + (Number(l.totalAmount) || 0), 0));
}
