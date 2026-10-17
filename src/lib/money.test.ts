import { formatMoney, toCurrencyCode } from './money';

describe('formatMoney (same output as the kh-pos web menu)', () => {
  it('formats USD with 2 decimals, grouping and the symbol first', () => {
    expect(formatMoney(10, 'USD')).toBe('$10.00');
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('formats KHR without decimals and the riel sign after', () => {
    expect(formatMoney(4000, 'KHR')).toBe('4,000៛');
    expect(formatMoney(1234.6, 'KHR')).toBe('1,235៛');
  });

  it('handles bad input and negatives', () => {
    expect(formatMoney('abc', 'USD')).toBe('$0.00');
    expect(formatMoney(null, 'USD')).toBe('$0.00');
    expect(formatMoney(-2.5, 'USD')).toBe('$-2.50');
  });

  it('falls back to USD for unknown currency settings', () => {
    expect(toCurrencyCode('KHR')).toBe('KHR');
    expect(toCurrencyCode('JPY')).toBe('USD');
    expect(toCurrencyCode(undefined)).toBe('USD');
  });
});
