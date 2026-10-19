import { branchBody, branchForm, emptyBranch, emptyUser, emptySlot, slotBody, slotForm, userBody, userForm, validateBranch, branchTitle, validateUser, validNewPassword } from './org';

describe('users', () => {
  it('needs a login, password, name, role and branch for a new account', () => {
    const f = { ...emptyUser('w1'), username: 'sok', password: 'abcd', fullname: 'Sok', roleId: 'r1' };
    expect(validateUser(f, true)).toBeNull();
    expect(validateUser({ ...f, username: 'so' }, true)).toBe('username');
    expect(validateUser({ ...f, password: 'abc' }, true)).toBe('password');
    expect(validateUser({ ...f, fullname: ' ' }, true)).toBe('fullname');
    expect(validateUser({ ...f, roleId: '' }, true)).toBe('roleId');
    expect(validateUser({ ...f, warehouseId: '' }, true)).toBe('warehouseId');
  });

  it('an edit needs no login or password', () => {
    const f = { ...emptyUser('w1'), fullname: 'Sok', roleId: 'r1' };
    expect(validateUser(f, false)).toBeNull();
  });

  it('keeps the username and picture of an existing account, with a placeholder password', () => {
    const row = { id: 'u1', username: 'sok', fullname: 'Sok', phoneNumber: '012', profile: '/p.png', roleId: 'r1', currentWarehouseId: 'w1' };
    const f = { ...userForm(row), fullname: ' Sok S ', roleId: 'r2' };
    expect(userBody(f, row)).toEqual({ id: 'u1', username: 'sok', password: '-', phoneNumber: '012', fullname: 'Sok S', profile: '/p.png', roleId: 'r2', warehouseId: 'w1' });
    expect(userBody({ ...emptyUser('w1'), username: ' sok ', password: 'pw12', fullname: 'S', roleId: 'r' })).toMatchObject({ username: 'sok', password: 'pw12', profile: '' });
  });

  it('checks a new password', () => {
    expect(validNewPassword('abcd')).toBe(true);
    expect(validNewPassword('abc')).toBe(false);
  });
});

describe('branches', () => {
  it("uses kh-pos' minimum lengths", () => {
    const f = { ...emptyBranch(), warehouseName: 'Main', ownerName: 'Owner', userName: 'owner', password: '1234' };
    expect(validateBranch(f, true)).toBeNull();
    expect(validateBranch({ ...f, warehouseName: 'ab' }, true)).toBe('warehouseName');
    expect(validateBranch({ ...f, ownerName: 'ab' }, true)).toBe('ownerName');
    expect(validateBranch({ ...f, userName: 'abc' }, true)).toBe('userName');
    expect(validateBranch({ ...f, password: '123' }, true)).toBe('password');
    expect(validateBranch({ ...f, userName: '', password: '' }, false)).toBeNull();
  });

  it('a new branch sends the owner login; an edit sends the id only', () => {
    const f = { ...emptyBranch(), warehouseName: ' Main ', ownerName: 'Owner', userName: ' owner ', password: ' 1234 ' };
    expect(branchBody(f)).toMatchObject({ warehouseName: 'Main', userName: 'owner', password: '1234' });
    const edit = branchBody(branchForm({ id: 'w1', name: 'Main', isMain: true, ownerName: 'Owner' }), { id: 'w1', name: 'Main', isMain: true });
    expect(edit).toMatchObject({ id: 'w1', warehouseName: 'Main' });
    expect(edit).not.toHaveProperty('password');
  });
  it('carries the picture and the coordinates, and names the main branch', () => {
    const row = { id: 'w1', name: 'Mood', isMain: true, ownerName: 'Owner', image: 'http://i/x.jpg', lat: '11.5', lng: '104.8' };
    const f = branchForm(row);
    expect(f).toMatchObject({ image: 'http://i/x.jpg', lat: '11.5', lng: '104.8' });
    expect(branchBody(f, row)).toMatchObject({ image: 'http://i/x.jpg', lat: '11.5', lng: '104.8' });
    expect(validateBranch({ ...f, lat: 'north' }, false)).toBe('lat');
    expect(validateBranch({ ...f, lng: '12e' }, false)).toBe('lng');
    expect(validateBranch({ ...f, lat: '', lng: '' }, false)).toBeNull();
    expect(branchTitle(row)).toBe('Mood (Main)');
    expect(branchTitle({ name: 'Floor', isMain: false })).toBe('Floor');
  });
});

describe('slots', () => {
  it('round-trips a slot', () => {
    const row = { id: 's1', name: 'Bar', warehouseId: 'w1', forReplenishment: true };
    expect(slotForm(row)).toEqual({ slotName: 'Bar', forReplenishment: true });
    expect(slotBody({ ...slotForm(row), slotName: ' Bar 2 ' }, 'w1', row)).toEqual({ id: 's1', warehouseId: 'w1', slotName: 'Bar 2', forReplenishment: true });
    expect(slotBody({ ...emptySlot(), slotName: 'New' }, 'w1')).toEqual({ warehouseId: 'w1', slotName: 'New', forReplenishment: false });
  });
});
