/**
 * Price display, matching kh-pos `formatCurrency` + `formatForDisplay`
 * (src/lib/currency.ts, src/hooks/use-currency-format.ts): USD "$1,234.50", KHR "1,235៛".
 * Formatting is done by hand because Android's Intl data may not include km-KH.
 */
export type CurrencyCode = 'USD' | 'KHR' | 'EUR' | 'GBP';

const CURRENCIES: Record<CurrencyCode, { symbol: string; before: boolean; decimals: number }> = {
  USD: { symbol: '$', before: true, decimals: 2 },
  KHR: { symbol: '៛', before: false, decimals: 0 },
  EUR: { symbol: '€', before: false, decimals: 2 },
  GBP: { symbol: '£', before: true, decimals: 2 },
};

export function toCurrencyCode(value: string | null | undefined): CurrencyCode {
  return value && value in CURRENCIES ? (value as CurrencyCode) : 'USD';
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(amount: number | string | null | undefined, currency: CurrencyCode = 'USD'): string {
  const cfg = CURRENCIES[currency];
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  const fixed = Math.abs(value).toFixed(cfg.decimals);
  const [intPart = '0', frac] = fixed.split('.');
  const number = `${value < 0 ? '-' : ''}${group(intPart)}${frac ? `.${frac}` : ''}`;
  return cfg.before ? `${cfg.symbol}${number}` : `${number}${cfg.symbol}`;
}
