import type { OrderLine, StaffUser } from './api';
import { appliedPromotionIds, can, canEditStatus, checkStatusChange, lineNote, lineOptionIds, manualDiscount } from './line';

const user = (role: string, permissions: Record<string, string> | null): StaffUser => ({
  id: 'u', username: 'u', fullname: null, currentWarehouseId: 'w', warehouse: null, role: { role, permissions },
});
const staff = user('Staff', { order: 'create,read,update', 'order-preparation': 'read,create,update' });
const supervisor = user('SUPERVISOR', { 'order-preparation': 'create,read,update,delete' });
const owner = user('OWNER', null);

const line = (status: Record<string, number>, extra: Partial<OrderLine> = {}): OrderLine => ({
  orderDetailId: 'l1', variantId: 'v1', title: 'Fried Rice (Regular)',
  qty: Object.values(status).reduce((a, b) => a + b, 0), price: '3.00', totalAmount: '3.00',
  status: Object.entries(status).map(([s, qty]) => ({ status: s as 'pending', qty })),
  ...extra,
});

describe('permissions (same rules as kh-pos)', () => {
  it('reads "create,read,update" strings; OWNER can do everything; missing = read only', () => {
    expect(can(staff, 'order', 'update')).toBe(true);
    expect(can(staff, 'order-preparation', 'delete')).toBe(false);
    expect(can(staff, 'setting', 'read')).toBe(true);
    expect(can(staff, 'setting', 'update')).toBe(false);
    expect(can(owner, 'anything', 'delete')).toBe(true);
    expect(can(null, 'order', 'read')).toBe(false);
  });

  it('pending counts are editable by everyone; preparing/served need update + delete', () => {
    expect(canEditStatus(staff, 'pending')).toBe(true);
    expect(canEditStatus(staff, 'cooking')).toBe(false);
    expect(canEditStatus(staff, 'served')).toBe(false);
    expect(canEditStatus(supervisor, 'served')).toBe(true);
    expect(canEditStatus(owner, 'cooking')).toBe(true);
  });
});

describe('status count changes', () => {
  it('keeps at least one portion on the line', () => {
    expect(checkStatusChange(line({ pending: 1 }), 'pending', 0)).toBe('atLeastOne');
    expect(checkStatusChange(line({ pending: 1, served: 1 }), 'pending', 0)).toBe('ok');
  });

  it('asks before zeroing preparing or served', () => {
    expect(checkStatusChange(line({ pending: 1, cooking: 2 }), 'cooking', 0)).toBe('confirmZero');
    expect(checkStatusChange(line({ pending: 1, cooking: 2 }), 'cooking', 1)).toBe('ok');
  });
});

describe('reading a line', () => {
  const l = line(
    { pending: 2 },
    {
      orderModifiers: [
        { orderDetailId: 'l1', modifierItemId: 'egg', price: 0.5 },
        { orderDetailId: 'l1', modifierItemId: 'notes', price: 1, notes: 'extra spicy' },
      ],
      discounts: [
        { discountId: 'manual', name: 'Manual Discount', discountType: 'PERCENTAGE', value: 10, isManualDiscount: true },
        { discountId: 'promo-1', name: 'Happy hour' },
      ],
    },
  );

  it('finds the note and its extra charge', () => {
    expect(lineNote(l)).toEqual({ exists: true, notes: 'extra spicy', price: 1 });
    expect(lineNote(line({ pending: 1 }))).toEqual({ exists: false, notes: '', price: 0 });
  });

  it('separates the manual discount, promotions and options', () => {
    expect(manualDiscount(l)).toMatchObject({ discountType: 'PERCENTAGE', value: 10 });
    expect([...appliedPromotionIds(l)]).toEqual(['promo-1']);
    expect([...lineOptionIds(l)]).toEqual(['egg']);
  });
});
