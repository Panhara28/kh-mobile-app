import { resultOf, RESULT_MARK, withResult } from './steps';

describe('a later call uses the result of the one before', () => {
  it('puts the result in the path and the body, and leaves a step with no mark alone', () => {
    const step = { method: 'PUT' as const, path: `/api/replenishment/${RESULT_MARK}/stock-picking-list`, body: { id: RESULT_MARK, rows: [1] } };
    expect(withResult(step, 'R 9')).toEqual({ method: 'PUT', path: '/api/replenishment/R%209/stock-picking-list', body: { id: 'R 9', rows: [1] } });
    const plain = { method: 'POST' as const, path: '/api/x', body: { a: 1 } };
    expect(withResult(plain, 'R9')).toEqual(plain);
    expect(withResult(step, undefined)).toBe(step);
  });

  it('reads the result only when it is a text', () => {
    expect(resultOf({ result: 'abc' })).toBe('abc');
    expect(resultOf({ result: { data: [] } })).toBeUndefined();
    expect(resultOf({ result: '' })).toBeUndefined();
    expect(resultOf(undefined)).toBeUndefined();
  });
});
