import { parseSheet, rowWarnings, uploadBody } from './product-import';

const header = ['Code', 'Name', 'Price', 'Product Group', 'Cost', 'Stocks', 'Vendor Name', 'Estimation GP'];

describe('reading the product sheet', () => {
  it('needs a header row with the required columns', () => {
    expect(parseSheet([]).errors).toEqual(['Excel file must have a header row']);
    expect(parseSheet([['Code', 'Name'], ['1', 'x']]).errors).toEqual(['Missing required headers: Price, Product Group']);
    expect(parseSheet([header]).errors).toEqual(['The sheet has no product rows']);
  });
  it('maps the columns like the web: Code to barcode, Name to description, Price to rsp, Product Group to category', () => {
    const r = parseSheet([header, ['885', ' Cola ', 2.5, 'Drinks', 1.2, 24, 'Acme', 30]]);
    expect(r.errors).toEqual([]);
    expect(r.data).toEqual([{ barcode: '885', description: 'Cola', vendorName: 'Acme', cost: 1.2, rsp: 2.5, estimationGP: 30, category: 'Drinks', stocks: 24 }]);
  });
  it('reads columns in any order, takes missing optional columns as empty, and skips blank rows', () => {
    const r = parseSheet([['Product Group', 'Price', 'Name', 'Code'], ['Food', 4, 'Rice', 123], [null, null, '', ''], ['Food', '5', 'Oil', '456']]);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toEqual({ barcode: '123', description: 'Rice', vendorName: '', cost: 0, rsp: 4, estimationGP: 0, category: 'Food', stocks: 0 });
    expect(r.data[1]!.rsp).toBe(5);
  });
  it('warns about rows without a name, code or group, and sends the rows as data', () => {
    const rows = parseSheet([header, ['', 'A', 1, 'G'], ['1', '', 1, 'G'], ['2', 'B', 1, '']]).data;
    expect(rowWarnings(rows)).toEqual(['Row 2: no Code', 'Row 3: no Name', 'Row 4: no Product Group']);
    expect(uploadBody(rows)).toEqual({ data: rows });
  });
});
