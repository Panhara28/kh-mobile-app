import { deliveryBody, deliveryFormOf, deliverySubtitle, emptyDelivery, extraPriceText, validateDelivery } from './delivery';
import {
  WEB_DEFAULT_ROLE_ID,
  addBinding,
  availableBranches,
  bindBody,
  canDeleteUser,
  canResetPassword,
  emptyUser,
  initialBindEntries,
  normalizePhone,
  removeBinding,
  userBody,
  userFormOf,
  validateReset,
  validateUser,
  type UserRow,
} from './users';

const row: UserRow = { id: 'u1', username: 'mengi', fullname: 'Mengi', phoneNumber: '0964', profile: 'p.png', roleId: 'r1', currentWarehouseId: 'w1' };

describe('user form', () => {
  it('starts a new user in this branch, with the web default role only when the server has it', () => {
    expect(emptyUser('id', 'w1', [{ id: 'r1', role: 'Cashier' }]).roleId).toBe('');
    expect(emptyUser('id', 'w1', [{ id: WEB_DEFAULT_ROLE_ID, role: 'Cashier' }])).toMatchObject({ roleId: WEB_DEFAULT_ROLE_ID, warehouseId: 'w1', isNew: true });
  });
  it('an edit keeps the branch and has no password', () => {
    expect(userFormOf(row)).toMatchObject({ id: 'u1', password: '', warehouseId: 'w1', roleId: 'r1', isNew: false });
  });
  it('a phone number starting 1-9 gets a leading 0', () => {
    expect(normalizePhone('12345')).toBe('012345');
    expect(normalizePhone('0123')).toBe('0123');
    expect(normalizePhone('')).toBe('');
  });
  it('asks for username and password only for a new user, and a name always', () => {
    const f = emptyUser('id', 'w1', []);
    expect(validateUser(f)).toBe('username');
    expect(validateUser({ ...f, username: 'a' })).toBe('password');
    expect(validateUser({ ...f, username: 'a', password: 'x' })).toBe('fullname');
    expect(validateUser({ ...f, username: 'a', password: 'x', fullname: 'A' })).toBeNull();
    expect(validateUser({ ...userFormOf(row), fullname: '' })).toBe('fullname');
    expect(validateUser(userFormOf(row))).toBeNull();
  });
  it('builds the body the API takes', () => {
    expect(userBody({ ...userFormOf(row), username: ' mengi ' })).toEqual({ id: 'u1', username: 'mengi', password: '', phoneNumber: '0964', fullname: 'Mengi', profile: 'p.png', roleId: 'r1', warehouseId: 'w1' });
  });
});

describe('who may do what', () => {
  it("you can't delete yourself, and only an owner resets someone else's password", () => {
    expect(canDeleteUser('u1', 'u1')).toBe(false);
    expect(canDeleteUser('u2', 'u1')).toBe(true);
    expect(canResetPassword('OWNER', 'u2', 'u1')).toBe(true);
    expect(canResetPassword('owner', 'u1', 'u1')).toBe(false);
    expect(canResetPassword('Cashier', 'u2', 'u1')).toBe(false);
    expect(canResetPassword(undefined, 'u2', 'u1')).toBe(false);
  });
  it('checks the new password like the web (6 or more, typed twice)', () => {
    expect(validateReset('', '')).toBe('newPassword');
    expect(validateReset('12345', '12345')).toBe('newPassword');
    expect(validateReset('123456', '')).toBe('confirmPassword');
    expect(validateReset('123456', '1234567')).toBe('confirmPassword');
    expect(validateReset('123456', '123456')).toBeNull();
  });
});

describe('bind users', () => {
  it('shows the saved bindings, or this branch as the main one', () => {
    expect(initialBindEntries([], 27, 'u1', 'w1')).toEqual([{ userId: 'u1', warehouseId: 'w1', group: 27, isMain: true }]);
    expect(initialBindEntries([{ userId: 'u1', group: 3, isMain: true, user: { warehouseId: { id: 'w1' } } }, { userId: 'u9', group: 3, isMain: false, user: { warehouseId: { id: 'w2' } } }], 3, 'u1', 'w1').map((e) => e.warehouseId)).toEqual(['w1', 'w2']);
  });
  it('adds a branch not yet bound and never removes the main one', () => {
    const entries = initialBindEntries([], 5, 'u1', 'w1');
    const branches = [{ id: 'w1' }, { id: 'w2' }];
    expect(availableBranches(branches, entries)).toEqual([{ id: 'w2' }]);
    const added = addBinding(entries, 'w2', 5);
    expect(added[1]).toEqual({ userId: '', warehouseId: 'w2', group: 5, isMain: false, isNew: true });
    expect(removeBinding(added, 'w2')).toHaveLength(1);
    expect(removeBinding(added, 'w1')).toHaveLength(2);
  });
  it('sends the whole list with the main entry always in it', () => {
    const body = bindBody([{ userId: '', warehouseId: 'w2', group: 5, isMain: false, isNew: true }], 5, 'u1', 'w1');
    expect(body).toEqual([
      { userId: '', warehouseId: 'w2', group: 5, isMain: false, isNew: true },
      { userId: 'u1', warehouseId: 'w1', group: 5, isMain: true, isNew: false },
    ]);
  });
});

describe('delivery customers', () => {
  it('needs a name and a non-negative extra price', () => {
    expect(validateDelivery(emptyDelivery())).toBe('customerName');
    expect(validateDelivery({ ...emptyDelivery(), customerName: 'Grab', extraPrice: -1 })).toBe('extraPrice');
    expect(validateDelivery({ ...emptyDelivery(), customerName: 'Grab' })).toBeNull();
  });
  it('stores the name as the phone too, like the web box', () => {
    expect(deliveryBody({ customerName: ' Grab ', address: ' Street 1 ', extraPrice: 1.5 })).toEqual({ customerName: 'Grab', phone: 'Grab', address: 'Street 1', type: 'delivery', extraPrice: 1.5 });
  });
  it('shows the extra price like the web table', () => {
    expect(extraPriceText('0')).toBe('-');
    expect(extraPriceText(null)).toBe('-');
    expect(extraPriceText('1.5')).toBe('$1.50');
    expect(deliveryFormOf({ id: 'c', customerName: 'A', extraPrice: '2.00' }).extraPrice).toBe(2);
  });
  it('lists address, price, branch, date, creator and order count', () => {
    expect(deliverySubtitle({ id: 'c', customerName: 'A', address: 'St 1', extraPrice: '1', createdAt: '2026-01-02', createdBy: { fullname: 'Bo' }, warehouse: { name: 'Main' }, orders: [] }, 'orders')).toBe('St 1 · $1.00 · Main · 2026-01-02 · Bo · 0 orders');
  });
});
