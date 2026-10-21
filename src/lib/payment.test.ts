import { canCompletePayment, exchangeRateFrom, newPayment, orderTotal, otherCurrencyValue, paymentTotals, setPaymentAmount, setPaymentCurrency, toCheckoutPayments, type PaymentContext, type PaymentDraft } from './payment';

const usd: PaymentContext = { branchCurrency: 'USD', exchangeRate: 4000 };
const khr: PaymentContext = { branchCurrency: 'KHR', exchangeRate: 4000 };
const line = (over: Partial<PaymentDraft>): PaymentDraft => ({ ...newPayment(), paymentMethod: 'cash', ...over });

describe('exchange rate', () => {
  it('uses the setting, or 4100 when unset or invalid', () => {
    expect(exchangeRateFrom('4050')).toBe(4050);
    expect(exchangeRateFrom(null)).toBe(4100);
    expect(exchangeRateFrom('abc')).toBe(4100);
    expect(exchangeRateFrom('0')).toBe(4100);
  });
});

describe('typing an amount (USD branch)', () => {
  it('a USD line keeps the text as it is', () => {
    expect(setPaymentAmount(line({}), '12.', usd)).toMatchObject({ amount: '12.', amountUsd: '12.' });
  });
  it('a KHR line is converted to the branch currency', () => {
    expect(setPaymentAmount(line({ currency: 'KHR' }), '20000', usd)).toMatchObject({ amount: '20000', amountUsd: '5' });
  });
  it('treats an empty or invalid box as 0', () => {
    expect(setPaymentAmount(line({ currency: 'KHR' }), '', usd).amountUsd).toBe('0');
  });
});

describe('switching a line between USD and KHR (USD branch)', () => {
  it('converts what is typed, both ways', () => {
    const toKhr = setPaymentCurrency(line({ amount: '5', amountUsd: '5' }), 'KHR', usd);
    expect(toKhr).toMatchObject({ currency: 'KHR', amount: '20000', amountUsd: '5' });
    const back = setPaymentCurrency(toKhr, 'USD', usd);
    expect(back).toMatchObject({ currency: 'USD', amount: '5', amountUsd: '5' });
  });
  it('does nothing when the currency is the same', () => {
    const p = line({ amount: '5', amountUsd: '5' });
    expect(setPaymentCurrency(p, 'USD', usd)).toBe(p);
  });
});

describe('KHR branch follows the web formulas', () => {
  it('USD → KHR divides, KHR → USD multiplies', () => {
    expect(setPaymentCurrency(line({ amount: '8000', amountUsd: '8000' }), 'KHR', khr)).toMatchObject({ currency: 'KHR', amount: '2' });
    expect(setPaymentCurrency(line({ currency: 'KHR', amount: '2', amountUsd: '8000' }), 'USD', khr)).toMatchObject({ currency: 'USD', amount: '8000' });
  });
});

describe('totals', () => {
  it('works out received, remaining and change', () => {
    expect(paymentTotals([line({ amountUsd: '3' })], 10)).toEqual({ received: 3, remaining: 7, change: 0 });
    expect(paymentTotals([line({ amountUsd: '12' })], 10)).toEqual({ received: 12, remaining: 0, change: 2 });
    expect(paymentTotals([line({ amountUsd: '4' }), line({ amountUsd: '6' })], 10)).toEqual({ received: 10, remaining: 0, change: 0 });
  });

  it('can be completed only when paid in full and every line has a method', () => {
    expect(canCompletePayment([line({ amountUsd: '10' })], 10)).toBe(true);
    expect(canCompletePayment([line({ amountUsd: '9.99' })], 10)).toBe(false);
    expect(canCompletePayment([line({ amountUsd: '10', paymentMethod: '' })], 10)).toBe(false);
    expect(canCompletePayment([], 10)).toBe(false);
  });

  it('does not block on tiny rounding from a KHR conversion', () => {
    const p = setPaymentAmount(line({ currency: 'KHR' }), '33333', { branchCurrency: 'USD', exchangeRate: 3333.3 });
    expect(canCompletePayment([p], 10)).toBe(true); // 9.99999… rounds to the cent
  });
});

describe('checkout payments', () => {
  it('shares the total between lines and keeps the rate; the rest is change', () => {
    const lines = [line({ amount: '4', amountUsd: '4' }), line({ currency: 'KHR', amount: '24000', amountUsd: '6' }), line({ amount: '5', amountUsd: '5' })];
    expect(toCheckoutPayments(lines, 9, usd)).toEqual([
      { amount: 4, paymentMethod: 'cash', currency: 'USD', amountUsd: 4, exchangeRate: 4000, used: 4 },
      { amount: 24000, paymentMethod: 'cash', currency: 'KHR', amountUsd: 6, exchangeRate: 4000, used: 5 },
      { amount: 5, paymentMethod: 'cash', currency: 'USD', amountUsd: 5, exchangeRate: 4000, used: 0 },
    ]);
  });
});

describe('helpers', () => {
  it('shows the other currency under a total', () => {
    expect(otherCurrencyValue(2.5, 'USD', 4000)).toEqual({ currency: 'KHR', amount: 10000 });
    expect(otherCurrencyValue(10000, 'KHR', 4000)).toEqual({ currency: 'USD', amount: 2.5 });
  });
  it('adds line totals to the cent', () => {
    expect(orderTotal([{ totalAmount: '2.1' }, { totalAmount: 3.2 }, { totalAmount: 'x' }])).toBe(5.3);
  });
});
