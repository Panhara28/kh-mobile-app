import { createdText, emptyMethodForm, methodBody, methodFormOf, methodProblem, numbered } from './payment-methods';

describe('payment methods', () => {
  it('needs a name and sends it trimmed, with the id when editing', () => {
    expect(methodProblem(emptyMethodForm())).toBe('method');
    expect(methodProblem({ method: ' ' })).toBe('method');
    expect(methodProblem({ method: 'ABA' })).toBeNull();
    expect(methodBody({ method: ' ABA Pay ' })).toEqual({ method: 'ABA Pay' });
    expect(methodBody({ method: 'Cash' }, { method_id: 'm1', method: 'cash' })).toEqual({ id: 'm1', method: 'Cash' });
    expect(methodFormOf({ method_id: 'm', method: null })).toEqual({ method: '' });
  });
  it('numbers the list and shows the created time', () => {
    expect(numbered([{ method_id: 'a', method: 'Cash' }, { method_id: 'b', method: 'ABA' }]).map((m) => m.no)).toEqual([1, 2]);
    expect(createdText({ created_at: '2026-10-20T09:15:33.000Z' })).toBe('2026-10-20 09:15');
    expect(createdText({ created_at: null })).toBe('');
  });
});
