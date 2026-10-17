import { discountCapEnabled, pickSetting } from './settings';

describe('branch settings', () => {
  const rows = [
    { option: 'CURRENCY', value: 'USD', warehouse: null },
    { option: 'ORDER_DISCOUNT_RULES', value: '{"maxQtyPerLine":{"enabled":false,"value":3}}', warehouse: null },
    { option: 'ORDER_DISCOUNT_RULES', value: '{"maxQtyPerLine":{"enabled":true,"value":2}}', warehouse: 'floor' },
  ];

  it("uses the branch's own row before the global one", () => {
    expect(pickSetting(rows, 'ORDER_DISCOUNT_RULES', 'floor')).toContain('"enabled":true');
    expect(pickSetting(rows, 'ORDER_DISCOUNT_RULES', 'mood')).toContain('"enabled":false');
    expect(pickSetting(rows, 'CURRENCY', 'mood')).toBe('USD');
    expect(pickSetting(rows, 'MISSING', 'mood')).toBeNull();
  });

  it('reads the "max quantity per line" cap like kh-pos (missing = enabled)', () => {
    expect(discountCapEnabled('{"maxQtyPerLine":{"enabled":true,"value":2,"countBy":"PRODUCT"}}')).toBe(true);
    expect(discountCapEnabled('{"maxQtyPerLine":{"enabled":false,"value":3}}')).toBe(false);
    expect(discountCapEnabled('{"maxQtyPerLine":{"enabled":true,"value":0}}')).toBe(false);
    expect(discountCapEnabled(null)).toBe(true);
    expect(discountCapEnabled('not json')).toBe(true);
  });
});
