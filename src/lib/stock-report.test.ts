import { stockCells, stockCsv, stockFilterCount, stockQuery } from './stock-report';

const range = { start: '2026-10-19 00:00:00', end: '2026-10-19 23:59:59' };

describe('stock report', () => {
  it('always sends both dates and only the filters that are set', () => {
    expect(stockQuery({ range, warehouseIds: [], categoryIds: [], productId: '' })).toBe('startDate=2026-10-19&endDate=2026-10-19+23%3A59%3A59');
    expect(stockQuery({ range, warehouseIds: ['w1', 'w2'], categoryIds: ['c1'], productId: 'p' })).toBe('startDate=2026-10-19&endDate=2026-10-19+23%3A59%3A59&warehouseId=w1%2Cw2&categoryIds=c1&productId=p');
    expect(stockFilterCount({ warehouseIds: ['w'], categoryIds: ['c'], productId: 'p' }, true)).toBe(3);
    expect(stockFilterCount({ warehouseIds: ['w'], categoryIds: [], productId: '' }, false)).toBe(0);
  });
  it('shows unit cost and price on details and totals on summaries', () => {
    expect(stockCells({ type: 'detail', qty: 4, cost: 2.5, price: 4 })).toEqual({ cost: 2.5, price: 4, qty: 4, totalCost: 10, totalPrice: 16 });
    expect(stockCells({ type: 'category', qty: 4, cost: 10, price: 16 })).toEqual({ cost: null, price: null, qty: 4, totalCost: 10, totalPrice: 16 });
  });
  it('exports the web columns', () => {
    const l = stockCsv([{ type: 'total', qty: 4, cost: 10, price: 16 }, { type: 'detail', product_code: 'A1', name: 'Cola', qty: 4, cost: 2.5, price: 4 }]).split('\n');
    expect(l[0]).toBe('Type,Product Code,Product Name,Cost,Price,Quantity,Total Cost,Total Price');
    expect(l[1]).toBe('GRAND TOTAL,,,,,4,10.00,16.00');
    expect(l[2]).toBe('Detail,A1,Cola,2.50,4.00,4,10.00,16.00');
  });
});
