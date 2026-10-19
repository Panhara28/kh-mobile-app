import { emptyTemplate, extrasText, templateBody, templateForm, validateTemplate, type TemplateRow } from './pricing-templates';

const row: TemplateRow = { template_id: 't1', template_name: 'Weekend night', time_slot: 'late_night', day_type: 'weekend', extra_seat_prices: { standard: 0, vip: 2.5, couple: 3, sofa: 7 } };

describe('pricing templates', () => {
  it('starts with the kh-pos defaults', () => {
    expect(emptyTemplate()).toMatchObject({ timeSlot: 'all_day', dayType: 'all_days', standard: 0, wheelchair: 0, vip: 2, couple: 3 });
  });
  it('needs a name and no negative prices', () => {
    expect(validateTemplate(emptyTemplate())).toBe('name');
    expect(validateTemplate({ ...emptyTemplate(), name: 'x' })).toBeNull();
    expect(validateTemplate({ ...emptyTemplate(), name: 'x', vip: -1 })).toBe('vip');
  });
  it('reads a row and writes it back without dropping seat types the phone does not edit', () => {
    const f = templateForm(row);
    expect(f).toMatchObject({ name: 'Weekend night', timeSlot: 'late_night', vip: 2.5, wheelchair: 0 });
    expect(templateBody({ ...f, vip: 4 }, row)).toEqual({ id: 't1', template_name: 'Weekend night', time_slot: 'late_night', day_type: 'weekend', extra_seat_prices: { standard: 0, wheelchair: 0, vip: 4, couple: 3, sofa: 7 } });
    expect(templateBody({ ...emptyTemplate(), name: ' New ' }).template_name).toBe('New');
    expect('id' in templateBody(emptyTemplate())).toBe(false);
  });
  it('lists only the extras that cost something', () => {
    expect(extrasText(row)).toBe('vip +2.5, couple +3, sofa +7');
    expect(extrasText({ extra_seat_prices: null })).toBe('');
  });
});
