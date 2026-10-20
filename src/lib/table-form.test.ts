import type { RestaurantTable } from './api';
import { cleanTable, emptyTableForm, formFromTable, optionList, tableOptions, validateTable } from './table-form';

describe('table form', () => {
  it('reads the section and shape lists from the settings', () => {
    const opts = tableOptions(
      [
        { option: 'TABLE_SELECTION', value: JSON.stringify([{ value: 'in', label: 'Indoor' }, { value: 'out' }, { label: 'no value' }]), warehouse: 'w1' },
        { option: 'TABLE_SHAPE', value: 'not json', warehouse: 'w1' },
      ],
      'w1',
    );
    expect(opts.sections).toEqual([
      { value: 'in', label: 'Indoor' },
      { value: 'out', label: 'out' },
    ]);
    expect(opts.shapes).toEqual([]);
    expect(optionList(null)).toEqual([]);
    expect(optionList('{"a":1}')).toEqual([]);
  });

  it('fills the form from a table, splitting the saved features', () => {
    const t: RestaurantTable = { id: 't1', table_name: 'A-01', setting_capacity: 6, section: 'in', status: 'available', order: null, table_shape: 'round', special_features: 'window, quiet ,', location_description: 'by the door', addional_notes: 'x' };
    expect(formFromTable(t)).toEqual({ tableNumber: 'A-01', seatingCapacity: 6, section: 'in', tableShape: 'round', locationDescription: 'by the door', features: ['window', 'quiet'], additionalNotes: 'x' });
  });

  it('asks for the same required fields as kh-pos', () => {
    const f = { ...emptyTableForm(), tableNumber: 'T1', section: 'in', tableShape: 'round' };
    expect(validateTable(f)).toBeNull();
    expect(validateTable({ ...f, tableNumber: ' ' })).toBe('tableNumber');
    expect(validateTable({ ...f, seatingCapacity: 0 })).toBe('seatingCapacity');
    expect(validateTable({ ...f, section: '' })).toBe('section');
    expect(validateTable({ ...f, tableShape: '' })).toBe('tableShape');
  });

  it('trims what is saved', () => {
    expect(cleanTable({ tableNumber: ' T1 ', seatingCapacity: 3.7, section: ' in ', tableShape: 'round', features: [' a ', ''], locationDescription: ' x ', additionalNotes: undefined })).toEqual({
      tableNumber: 'T1',
      seatingCapacity: 3,
      section: 'in',
      tableShape: 'round',
      locationDescription: 'x',
      features: ['a'],
      additionalNotes: '',
    });
  });
});
