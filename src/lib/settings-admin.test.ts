import { cleanSettingValue, currencyOptions, displayValue, effectiveSettings, optionLabel, previewValue, settingKind } from './settings-admin';

describe('setting kinds', () => {
  it('picks the editor from the option and the current value', () => {
    expect(settingKind('CURRENCY', 'USD')).toBe('currency');
    expect(settingKind('EXCHANGE_RATE', '4100')).toBe('number');
    expect(settingKind('TABLE_SHAPE', '[{"value":"a"}]')).toBe('json');
    expect(settingKind('TYPE_POS', '{ "system_type": "RESTAURANT" }')).toBe('json');
    expect(settingKind('INVOICE_RECEIPT', 'default,x')).toBe('text');
    expect(settingKind('BROKEN', '{not json')).toBe('text');
    expect(settingKind(null, null)).toBe('text');
  });
});

describe('cleaning a typed value', () => {
  it('accepts only real currencies and positive numbers', () => {
    expect(cleanSettingValue('currency', ' KHR ')).toBe('KHR');
    expect(cleanSettingValue('currency', 'XYZ')).toBeNull();
    expect(cleanSettingValue('number', '4,050')).toBe('4050');
    expect(cleanSettingValue('number', '0')).toBeNull();
    expect(cleanSettingValue('number', 'abc')).toBeNull();
  });
  it('keeps JSON valid, saving it compact, and leaves plain text alone', () => {
    expect(cleanSettingValue('json', '{\n  "a": 1\n}')).toBe('{"a":1}');
    expect(cleanSettingValue('json', '{"a":')).toBeNull();
    expect(cleanSettingValue('text', '  keep as is ')).toBe('  keep as is ');
  });
  it('lists the currencies', () => {
    expect(currencyOptions().map((o) => o.value)).toEqual(['USD', 'KHR', 'EUR', 'GBP']);
  });
});

describe('showing settings', () => {
  it('indents JSON and previews on one line', () => {
    expect(displayValue('json', '{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(displayValue('text', 'x')).toBe('x');
    expect(previewValue('a\n  b   c')).toBe('a b c');
    expect(previewValue('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });
  it('makes a readable name', () => {
    expect(optionLabel('ORDER_DISCOUNT_RULES')).toBe('Order discount rules');
    expect(optionLabel(null)).toBe('');
  });
  it("prefers the branch's own row over the shared one, and drops other branches' rows", () => {
    const rows = [
      { id: 1, option: 'CURRENCY', value: 'USD', warehouse: null },
      { id: 2, option: 'CURRENCY', value: 'KHR', warehouse: 'w1' },
      { id: 3, option: 'CURRENCY', value: 'EUR', warehouse: 'w2' },
      { id: 4, option: 'A_SETTING', value: 'x', warehouse: null },
    ];
    expect(effectiveSettings(rows, 'w1').map((r) => [r.option, r.value])).toEqual([['A_SETTING', 'x'], ['CURRENCY', 'KHR']]);
  });
});
