import { EMPTY_REGISTER, registerProblem } from './register';

const ok = { martName: 'My Shop', ownerName: 'Dara', address: 'Phnom Penh', phoneNumber: '012345678', userName: 'dara', password: 'secret1', confirmPassword: 'secret1' };

describe('register form', () => {
  it('needs every field', () => {
    expect(registerProblem(EMPTY_REGISTER)).toBe('allRequired');
    expect(registerProblem({ ...ok, address: ' ' })).toBe('allRequired');
  });
  it('needs 3 letters for the names and the password, like the web', () => {
    expect(registerProblem({ ...ok, userName: 'da' })).toBe('tooShort');
    expect(registerProblem({ ...ok, password: 'ab', confirmPassword: 'ab' })).toBe('tooShort');
  });
  it('needs the password twice the same', () => {
    expect(registerProblem({ ...ok, confirmPassword: 'other1' })).toBe('passwordMismatch');
    expect(registerProblem(ok)).toBeNull();
  });
});
