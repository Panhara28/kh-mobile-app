import { dateOnly, emptySupplierForm, matchesSupplier, orNA, supplierFormOf, supplierProblem, supplierSaveBody, type SupplierItem } from './suppliers';

const s: SupplierItem = { id: 's1', name: 'Acme Foods', contactName: 'Sok', contactPhone: '012 345', contactEmail: 'a@x.com', address: 'Phnom Penh', note: 'Pays in 30 days', isConsignment: 1, createdAt: '2026-04-25 19:03:20' };

describe('the supplier form', () => {
  it('starts empty and needs a name that is not blank', () => {
    expect(emptySupplierForm()).toEqual({ name: '', contactName: '', contactEmail: '', contactPhone: '', address: '', note: '', isConsignment: false });
    expect(supplierProblem(emptySupplierForm())).toBe('name');
    expect(supplierProblem({ ...emptySupplierForm(), name: '  ' })).toBe('name');
    expect(supplierProblem({ ...emptySupplierForm(), name: 'A' })).toBeNull();
  });
  it('is filled from a supplier and sent whole, with the id when editing', () => {
    const f = supplierFormOf(s);
    expect(f).toEqual({ name: 'Acme Foods', contactName: 'Sok', contactEmail: 'a@x.com', contactPhone: '012 345', address: 'Phnom Penh', note: 'Pays in 30 days', isConsignment: true });
    expect(supplierSaveBody({ ...f, name: ' Acme ' }, s)).toEqual({ id: 's1', name: 'Acme', contactName: 'Sok', contactPhone: '012 345', contactEmail: 'a@x.com', address: 'Phnom Penh', note: 'Pays in 30 days', isConsignment: true });
    const created = supplierSaveBody({ ...emptySupplierForm(), name: 'New' });
    expect('id' in created).toBe(false);
    expect(created).toMatchObject({ contactName: '', contactPhone: '', contactEmail: '', address: '', note: '', isConsignment: false });
  });
});

describe('the list', () => {
  it('searches every text field', () => {
    for (const q of ['acme', 'SOK', '012', 'a@x', 'penh', '30 days']) expect(matchesSupplier(s, q)).toBe(true);
    expect(matchesSupplier(s, 'zzz')).toBe(false);
    expect(matchesSupplier(s, ' ')).toBe(true);
  });
  it('shows N/A for blanks and the date part of the created time', () => {
    expect([orNA(null), orNA(' '), orNA('x')]).toEqual(['N/A', 'N/A', 'x']);
    expect(dateOnly(s.createdAt)).toBe('2026-04-25');
    expect(dateOnly(null)).toBe('');
  });
});
