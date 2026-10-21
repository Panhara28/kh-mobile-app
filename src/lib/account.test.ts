import { deviceLabelOf, DEFAULT_PRINT_URL, isValidPrintUrl, normalizePrintUrl, passwordChecks, passwordFormValid, passwordStrength } from './account';
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

describe('print and device settings', () => {
  it('accepts only ws:// or wss:// addresses', () => {
    expect(isValidPrintUrl('ws://192.168.1.20:8181')).toBe(true);
    expect(isValidPrintUrl('wss://pos.example.com/?token=SHOP-1')).toBe(true);
    expect(isValidPrintUrl('http://192.168.1.20')).toBe(false);
    expect(isValidPrintUrl('')).toBe(false);
    expect(isValidPrintUrl('ws://')).toBe(false);
    expect(normalizePrintUrl(` ${DEFAULT_PRINT_URL} `)).toBe('');
    expect(normalizePrintUrl(' ws://10.0.0.5:8181 ')).toBe('ws://10.0.0.5:8181');
  });
  it('sends the device id and an encoded label', () => {
    setDeviceHeaders('abc', ' ម៉ាស៊ីន ');
    expect(getDeviceHeaders()['X-Device-Id']).toBe('abc');
    expect(decodeURIComponent(getDeviceHeaders()['X-Device-Label']!)).toBe('ម៉ាស៊ីន');
    setDeviceHeaders('abc', '');
    expect(getDeviceHeaders()['X-Device-Label']).toBeUndefined();
    expect(deviceLabelOf('x'.repeat(150))).toHaveLength(100);
  });
});
