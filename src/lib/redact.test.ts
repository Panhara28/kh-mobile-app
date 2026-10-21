import { stripSecrets } from './redact';

describe('stripSecrets', () => {
  it('removes every token key, at any depth, and keeps the rest', () => {
    const input = { success: true, result: { orders: [{ id: 'o', createdBy: { fullname: 'Dev', token: 'secret', warehouseId: { id: 'w', token: 'x' } } }], total: 1 } };
    const out = stripSecrets(input);
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(JSON.stringify(out)).not.toContain('"token"');
    expect(out.result.orders[0]!.createdBy.fullname).toBe('Dev');
    expect(out.result.total).toBe(1);
  });
  it('leaves plain values and null alone', () => {
    expect(stripSecrets(null)).toBeNull();
    expect(stripSecrets('a')).toBe('a');
    expect(stripSecrets([1, { token: 1, a: 2 }])).toEqual([1, { a: 2 }]);
  });
});
