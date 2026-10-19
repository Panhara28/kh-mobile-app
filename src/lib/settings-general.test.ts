import type { StaffUser } from '@/lib/api';
import type { SettingRow } from '@/lib/settings-admin';
import {
  canAddKeyValue,
  canEditSetting,
  canRemovePrinter,
  cleanNumber,
  detectValueType,
  generateCategories,
  getSettingConfig,
  menuLink,
  paddingAt,
  parseIntegrations,
  parseInvoice,
  parseLabelPrint,
  parseOrderDiscountRules,
  parsePort,
  parsePrintServer,
  parsePrintSocket,
  parseProductMenu,
  parseTypePos,
  serializeInvoice,
  serializeLabelPrint,
  serializeOrderDiscountRules,
  serializePrintServer,
  settingsForCategory,
  stripCommas,
  systemType,
  typePosWithSystem,
  validateSetting,
  withPadding,
} from './settings-general';
import { hubTiles } from './settings-hub';

const row = (id: number, option: string, value = '', warehouse: string | null = null): SettingRow => ({ id, option, value, warehouse });
const user = (permissions: Record<string, string>, role = 'CASHIER') => ({ role: { role, permissions } }) as unknown as StaffUser;

describe('categories', () => {
  const base = [row(1, 'CURRENCY', 'USD'), row(2, 'EXCHANGE_RATE', '4100'), row(3, 'PRINT_SERVER', '{}'), row(4, 'PRINT_SOCKET', '{}'), row(5, 'TABLE_SHAPE', '[]'), row(6, 'TYPE_POS', '{"system_type":"MART"}'), row(7, 'BRAND', '{}')];

  it('hides the restaurant and cinema sections for a mart, and currency off the main branch', () => {
    expect(generateCategories(base, true).map((c) => c.option)).toEqual(['CURRENCY', 'EXCHANGE_RATE', 'TYPE_POS', 'BRAND']);
    expect(generateCategories(base, false).map((c) => c.option)).toEqual(['TYPE_POS', 'BRAND']);
  });

  it('shows the restaurant sections for a restaurant and the socket for a cinema', () => {
    const rest = base.map((r) => (r.option === 'TYPE_POS' ? row(6, 'TYPE_POS', '{"system_type":"RESTAURANT"}') : r));
    expect(generateCategories(rest, true).map((c) => c.option)).toEqual(expect.arrayContaining(['PRINT_SERVER', 'TABLE_SHAPE']));
    expect(generateCategories(rest, true).map((c) => c.option)).not.toContain('PRINT_SOCKET');
    const cinema = base.map((r) => (r.option === 'TYPE_POS' ? row(6, 'TYPE_POS', '{"system_type":"CINEMA"}') : r));
    expect(generateCategories(cinema, true).map((c) => c.option)).toContain('PRINT_SOCKET');
  });

  it('lists one category per option, with the web id and label', () => {
    const cats = generateCategories([row(1, 'BRAND'), row(2, 'BRAND', '', 'w1'), row(3, 'ORDER_DISCOUNT_RULES')], true);
    expect(cats).toEqual([
      { id: 'brand', label: 'Brand', option: 'BRAND' },
      { id: 'order-discount-rules', label: 'Order Discount Rules', option: 'ORDER_DISCOUNT_RULES' },
    ]);
    expect(settingsForCategory([row(1, 'BRAND'), row(2, 'BRAND', '', 'w1'), row(3, 'X')], cats[0])).toHaveLength(2);
  });

  it('reads the POS type, and tolerates broken text', () => {
    expect(systemType(base)).toBe('MART');
    expect(systemType([row(1, 'TYPE_POS', 'oops')])).toBe('');
    expect(systemType([])).toBe('');
  });

  it('names an unknown option from its words and guesses the editor from the value', () => {
    expect(getSettingConfig('SOME_NEW_THING', '[1]').label).toBe('Some New Thing');
    expect(getSettingConfig('SOME_NEW_THING', '[1]').type).toBe('json-array');
    expect(detectValueType('12.5')).toBe('number');
    expect(detectValueType('{"a":1}')).toBe('json');
    expect(detectValueType('{bad}')).toBe('text');
    expect(detectValueType('')).toBe('text');
  });
});

describe('who may edit', () => {
  it("a branch row anywhere, the shared row only on the main branch", () => {
    expect(canEditSetting(row(1, 'A', '', 'w1'), false)).toBe(true);
    expect(canEditSetting(row(1, 'A'), false)).toBe(false);
    expect(canEditSetting(row(1, 'A'), true)).toBe(true);
  });
});

describe('numbers and checks before saving', () => {
  it('accepts numbers and refuses blanks', () => {
    expect(cleanNumber(' 4,100 ')).toBe('4100');
    expect(cleanNumber('')).toBeNull();
    expect(cleanNumber('abc')).toBeNull();
    expect(validateSetting('number', '')).toBe('number');
    expect(validateSetting('number', '7')).toBeNull();
    expect(validateSetting('currency', 'EUR')).toBe('currency');
    expect(validateSetting('currency', 'KHR')).toBeNull();
    expect(validateSetting('brand', '{}')).toBeNull();
  });
});

describe('Type POS', () => {
  it('turns the shared draft on for a restaurant', () => {
    expect(typePosWithSystem(parseTypePos('{"system_type":"MART","shared_order_draft":false}'), 'RESTAURANT')).toMatchObject({ system_type: 'RESTAURANT', shared_order_draft: true });
    expect(typePosWithSystem(parseTypePos('{"shared_order_draft":false}'), 'CINEMA').shared_order_draft).toBe(false);
  });
  it('defaults', () => {
    expect(parseTypePos('')).toEqual({ system_type: '', shared_order_draft: false, enviroment: 'production' });
    expect(parseTypePos('bad').enviroment).toBe('production');
  });
});

describe('Invoice receipt text', () => {
  const live = 'template-funbeerking,Mood,https://x/y.png,0 0 0 0,0,0,0,amount,none,1';
  it('round-trips the comma separated text', () => {
    expect(serializeInvoice(parseInvoice(live))).toBe(live);
  });
  it('fills the web defaults for an empty value', () => {
    expect(parseInvoice('')).toMatchObject({ template: 'template-i', settings: '2 2 2 2', receiptCountPerCheckout: '1', discountDisplayFormat: 'amount', showTotalDiscount: 'none' });
  });
  it('edits one padding side at a time (top right bottom left)', () => {
    expect(paddingAt('1 2 3 4', 2)).toBe('3');
    expect(withPadding('1 2 3 4', 1, '9')).toBe('1 9 3 4');
  });
  it('drops commas from typed text so later fields do not shift', () => {
    expect(stripCommas('A,B')).toBe('AB');
  });
});

describe('Order discount rules', () => {
  it('reads the stored aliases and writes them back', () => {
    const stored = '{"amountRule":{"enabled":true,"minAmount":120,"discountType":"AMOUNT","value":5},"qtyRule":{"enabled":false,"minQty":10,"discountType":"PERCENTAGE","value":2},"maxQtyPerLine":{"enabled":false,"value":4,"countBy":"CATEGORY"}}';
    const r = parseOrderDiscountRules(stored);
    expect(r.amountRule).toEqual({ enabled: true, min: 120, discountType: 'AMOUNT', value: 5 });
    expect(r.qtyRule.min).toBe(10);
    expect(r.maxQtyPerLine).toEqual({ enabled: false, value: 4, countBy: 'CATEGORY' });
    expect(JSON.parse(serializeOrderDiscountRules(r))).toEqual(JSON.parse(stored));
  });
  it('uses the web defaults when empty or broken', () => {
    expect(parseOrderDiscountRules('')).toMatchObject({ amountRule: { min: 100 }, qtyRule: { min: 50 }, maxQtyPerLine: { enabled: true, value: 3, countBy: 'VARIANT' } });
    expect(parseOrderDiscountRules('{oops').maxQtyPerLine.value).toBe(3);
  });
});

describe('product menu rules', () => {
  it('reads the rules and builds the public menu link', () => {
    expect(parseProductMenu('{"onlyForSale":true,"bannerUrl":"b.png"}')).toEqual({ onlyForSale: true, onlyInStock: false, bannerUrl: 'b.png' });
    expect(parseProductMenu('')).toEqual({ onlyForSale: false, onlyInStock: false, bannerUrl: '' });
    expect(menuLink('http://host:3001/', 'w1')).toBe('http://host:3001/menu?warehouse=w1');
  });
});

describe('printers', () => {
  it('keeps unknown print server keys and defaults the grouping', () => {
    const v = parsePrintServer('{"printers":[{"id":"1","name":"A","printer_name":"P","ip":"1.1.1.1","port":9100}],"extra":5}');
    expect(v.group_by).toBe('ITEM');
    expect(JSON.parse(serializePrintServer({ ...v, group_by: 'TABLE' }))).toMatchObject({ extra: 5, group_by: 'TABLE', printers: [{ id: '1' }] });
    expect(parsePrintServer('bad')).toEqual({ group_by: 'ITEM', printers: [], rest: {} });
  });
  it('never removes the last printer, and the port falls back to 9100', () => {
    expect(canRemovePrinter(1)).toBe(false);
    expect(canRemovePrinter(2)).toBe(true);
    expect(parsePort('')).toBe(9100);
    expect(parsePort('9101')).toBe(9101);
  });
  it('fills the print socket defaults', () => {
    expect(parsePrintSocket('{"url":"ws://x:1"}').printers.name).toBe('Cashier Printer');
    expect(parsePrintSocket('{"url":"ws://x:1"}').url).toBe('ws://x:1');
  });
});

describe('label print', () => {
  it('round-trips the label settings and leaves unset numbers out', () => {
    const stored = '{"paperSize":{"width":45,"height":30,"padding":{"top":0,"right":0,"bottom":0,"left":0}},"price":true,"barcode":{"displayValue":false,"width":2,"height":40},"using":"SOCKET","printerName":"L1"}';
    const v = parseLabelPrint(stored);
    expect(v.using).toBe('SOCKET');
    expect(JSON.parse(serializeLabelPrint(v))).toEqual(JSON.parse(stored));
    expect(parseLabelPrint('').paperSize.width).toBeUndefined();
  });
});

describe('lists', () => {
  it('only adds a new key/value when both are typed and the key is new', () => {
    expect(canAddKeyValue({ urgent: '1' }, 'urgent', '2')).toBe(false);
    expect(canAddKeyValue({}, ' ', '2')).toBe(false);
    expect(canAddKeyValue({}, 'warning', '30')).toBe(true);
  });
  it('fills missing integration fields', () => {
    expect(parseIntegrations('[{"name":"A"}]')).toEqual([{ name: 'A', url: '', token: '' }]);
    expect(parseIntegrations('bad')).toEqual([]);
  });
});

describe('settings hub tiles', () => {
  const owner = user({}, 'OWNER');
  it('shows the owner General and Users, Payment on the main branch, Delivery for a restaurant', () => {
    expect(hubTiles(owner, 'MART', false).map((t) => t.key)).toEqual(['general', 'users']);
    expect(hubTiles(owner, 'RESTAURANT', true).map((t) => t.key)).toEqual(['general', 'users', 'delivery', 'payment']);
  });
  it('limits other roles to the sections they may read', () => {
    expect(hubTiles(user({ setting: 'read' }), 'RESTAURANT', true).map((t) => t.key)).toEqual(['general']);
    expect(hubTiles(user({}), 'MART', true)).toEqual([]);
  });
  it('every section is built on the phone', () => {
    expect(hubTiles(owner, 'RESTAURANT', true).every((t) => t.available)).toBe(true);
  });
});
