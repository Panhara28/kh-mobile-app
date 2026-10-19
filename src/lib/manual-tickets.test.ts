import { emptyRow, manualBody, totalTickets, validateManual, type ManualRow } from './manual-tickets';

const ok = (over: Partial<ManualRow> = {}): ManualRow => ({ ...emptyRow('2026-10-19'), movieId: 'm', movieName: 'Film', hallId: 'h', basePrice: 4, shows: [{ time: '14:00', tickets: 10 }, { time: '19:30', tickets: 0 }], ...over });

describe('manual tickets', () => {
  it('checks each row in order', () => {
    expect(validateManual([])).toEqual({ index: -1, problem: 'rows' });
    expect(validateManual([ok()])).toBeNull();
    expect(validateManual([ok(), ok({ movieId: '' })])).toEqual({ index: 1, problem: 'movie' });
    expect(validateManual([ok({ hallId: '' })])?.problem).toBe('hall');
    expect(validateManual([ok({ day: '19/10' })])?.problem).toBe('day');
    expect(validateManual([ok({ shows: [{ time: '9:00', tickets: 1 }] })])?.problem).toBe('time');
    expect(validateManual([ok({ shows: [{ time: '09:00', tickets: 0 }] })])?.problem).toBe('tickets');
  });
  it('sends full times and leaves out shows with no tickets', () => {
    expect(manualBody([ok()])).toEqual([{ movieId: 'm', showdate: '2026-10-19', hallId: 'h', basePrice: 4, showtimes: [{ datetime: '2026-10-19 14:00:00', ticket: 10 }] }]);
    expect(totalTickets([ok(), ok({ shows: [{ time: '10:00', tickets: 2.9 }] })])).toBe(12);
  });
});
