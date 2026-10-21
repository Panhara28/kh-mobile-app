import { invoiceLink, qrMatrix, qrRuns, tableMenuLink } from './qr';

describe('links', () => {
  it('builds the table menu link and the invoice link like the web', () => {
    expect(tableMenuLink('http://192.168.0.100:3001/', 'w1', 't1')).toBe('http://192.168.0.100:3001/menu?warehouse=w1&table=t1');
    expect(invoiceLink('https://pos.example.com', 'w1', 'o9')).toBe('https://pos.example.com/invoice?warehouse=w1&order=o9');
    expect(tableMenuLink('http://x', null, 't1')).toBe('http://x/menu?warehouse=&table=t1');
  });
});

describe('the code', () => {
  const link = tableMenuLink('http://192.168.0.100:3001', 'b6351f13-4206-4504-8292-5d39e188fe75', '0f8fad5b-d9cb-469f-a165-70867728950e');
  const m = qrMatrix(link);

  it('is square and has the three finder squares in the corners', () => {
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const n = m.length;
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      expect(m[r]![c]).toBe(true);
      expect(m[r]![c + 6]).toBe(true);
      expect(m[r + 6]![c]).toBe(true);
      expect(m[r + 3]![c + 3]).toBe(true);
      expect(m[r + 1]![c + 1]).toBe(false);
    }
  });
  it('gives the same code for the same text and a different one for other text', () => {
    expect(qrMatrix(link)).toEqual(m);
    expect(qrMatrix(`${link}x`)).not.toEqual(m);
  });
  it('turns each row into runs that rebuild it', () => {
    const runs = qrRuns(m);
    runs.forEach((row, r) => {
      const rebuilt = Array<boolean>(m.length).fill(false);
      for (const run of row) for (let i = 0; i < run.length; i++) rebuilt[run.start + i] = true;
      expect(rebuilt).toEqual(m[r]);
    });
  });
});
