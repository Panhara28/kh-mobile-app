import { deviceLabelOf, passwordChecks, passwordFormValid, passwordStrength } from './account';
import { getDeviceHeaders, setDeviceHeaders } from './device-headers';

describe('change password', () => {
  it('lists the checks and the strength like the web', () => {
    expect(passwordChecks('Abcdef1!')).toEqual({ minLength: true, hasUpperCase: true, hasLowerCase: true, hasNumber: true, hasSpecialChar: true });
    expect(passwordStrength('')).toBe('none');
    expect(passwordStrength('abc')).toBe('weak');
    expect(passwordStrength('Abcdefgh')).toBe('medium');
    expect(passwordStrength('Abcdef1!')).toBe('strong');
  });
  it('needs all three fields and a matching confirmation', () => {
    expect(passwordFormValid('old', 'new', 'new')).toBe(true);
    expect(passwordFormValid('', 'new', 'new')).toBe(false);
    expect(passwordFormValid('old', 'new', 'nop')).toBe(false);
    expect(passwordFormValid('old', '', '')).toBe(false);
  });
});

describe('device settings', () => {
  it('sends the device id and an encoded label', () => {
    setDeviceHeaders('abc', ' ម៉ាស៊ីន ');
    expect(getDeviceHeaders()['X-Device-Id']).toBe('abc');
    expect(decodeURIComponent(getDeviceHeaders()['X-Device-Label']!)).toBe('ម៉ាស៊ីន');
    setDeviceHeaders('abc', '');
    expect(getDeviceHeaders()['X-Device-Label']).toBeUndefined();
    expect(deviceLabelOf('x'.repeat(150))).toHaveLength(100);
  });
});
