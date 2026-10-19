import { boardRows, localTotal, parseAmount } from './board';

const w = (id: string, name: string, total: string, isMain = false) => ({ warehouse_id: id, total_amount: total, warehouse: { id, name, isMain } });

describe('reading formatted amounts', () => {
  it('pulls the number out', () => {
    expect(parseAmount('$1,234.50')).toBe(1234.5);
    expect(parseAmount('៛12,000')).toBe(12000);
    expect(parseAmount('-$3.00')).toBe(-3);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount('n/a')).toBe(0);
  });
});

describe('the board rows', () => {
  const result = {
    local: [w('a', 'Branch A', '$10.00'), w('b', 'Main', '$250.50', true), w('c', 'Branch C', '$0.00')],
    integration: [
      { name: 'Brand X', data: [w('x1', 'X One', '$5.00'), w('x2', 'X Two', '$9.00')] },
      { name: 'Brand Y', data: null },
    ],
  };
  it('lists local branches biggest first, then each brand, and names brands that could not be reached', () => {
    const { rows, unreachable } = boardRows(result);
    expect(rows.map((r) => r.name)).toEqual(['Main', 'Branch A', 'Branch C', 'X Two', 'X One']);
    expect(rows[0]).toMatchObject({ isMain: true, text: '$250.50', value: 250.5, brand: '' });
    expect(rows[3]!.brand).toBe('Brand X');
    expect(unreachable).toEqual(['Brand Y']);
  });
  it('totals only the local branches', () => {
    expect(localTotal(boardRows(result).rows)).toBe(260.5);
  });
  it('copes with nothing', () => {
    expect(boardRows(null)).toEqual({ rows: [], unreachable: [] });
    expect(boardRows({}).rows).toEqual([]);
  });
});
