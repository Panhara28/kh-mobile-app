import { choiceOf, firstOpenStep, nextStep, printerProblem, printersBody, typeBody } from './setup';

const steps = (done: boolean[]) => ({ steps: (['store', 'type', 'currency', 'payment'] as const).map((key, i) => ({ key, done: done[i]! })) });

describe('setup steps', () => {
  it('opens the first step not done, or finish', () => {
    expect(firstOpenStep(steps([true, false, false, true]))).toBe('type');
    expect(firstOpenStep(steps([true, true, true, true]))).toBe('finish');
  });
  it('goes on to the next step, then to finish when all are done', () => {
    expect(nextStep(steps([true, true, false, false]), 'type')).toBe('currency');
    expect(nextStep(steps([true, true, true, true]), 'payment')).toBe('finish');
    expect(nextStep(steps([false, true, true, true]), 'payment')).toBe('store');
  });
});

describe('business type', () => {
  it('maps the small restaurant to RESTAURANT + LITE and back', () => {
    expect(typeBody('SMALL_RESTAURANT')).toEqual({ step: 'type', systemType: 'RESTAURANT', edition: 'LITE' });
    expect(typeBody('MART')).toEqual({ step: 'type', systemType: 'MART' });
    expect(choiceOf({ systemType: 'RESTAURANT', edition: 'LITE' })).toBe('SMALL_RESTAURANT');
    expect(choiceOf({ systemType: 'RESTAURANT', edition: 'FULL' })).toBe('RESTAURANT');
    expect(choiceOf({ systemType: '', edition: 'FULL' })).toBeNull();
  });
});

describe('printers step', () => {
  const p = { id: 'p1', name: 'Kitchen', printerName: '', ip: '192.168.1.50', port: '9100' };
  it('checks each printer', () => {
    expect(printerProblem([])).toBe('none');
    expect(printerProblem([{ ...p, name: ' ' }])).toBe('name');
    expect(printerProblem([{ ...p, ip: '' }])).toBe('ip');
    expect(printerProblem([{ ...p, port: '70000' }])).toBe('port');
    expect(printerProblem([p])).toBeNull();
  });
  it('sends every printer and a printer for every category', () => {
    expect(printersBody([p], [{ id: 'c1', printerId: 'gone' }, { id: 'c2', printerId: 'p1' }])).toEqual({
      step: 'printers',
      printers: [{ id: 'p1', name: 'Kitchen', printerName: 'Kitchen', ip: '192.168.1.50', port: 9100 }],
      categories: [
        { categoryId: 'c1', printerId: 'p1' },
        { categoryId: 'c2', printerId: 'p1' },
      ],
    });
  });
});
