/** The profile menu of the kh-pos web app: change password rules, device name, print and device settings. */

export interface PasswordChecks {
  minLength: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

/** The checklist shown under "New Password" (advice only, like the web). */
export function passwordChecks(p: string): PasswordChecks {
  return { minLength: p.length >= 8, hasUpperCase: /[A-Z]/.test(p), hasLowerCase: /[a-z]/.test(p), hasNumber: /\d/.test(p), hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(p) };
}

export function passwordStrength(p: string): 'none' | 'weak' | 'medium' | 'strong' {
  const n = Object.values(passwordChecks(p)).filter(Boolean).length;
  return n === 0 ? 'none' : n <= 2 ? 'weak' : n <= 4 ? 'medium' : 'strong';
}

/** The web enables the button when all three are filled and the confirmation matches. */
export const passwordFormValid = (oldP: string, newP: string, confirm: string) => oldP.trim() !== '' && newP.trim() !== '' && confirm !== '' && newP === confirm;

export const DEFAULT_PRINT_URL = 'ws://127.0.0.1:8181';

export function isValidPrintUrl(url: string): boolean {
  const t = url.trim();
  if (!/^wss?:\/\/[^\s/]+/i.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'ws:' || u.protocol === 'wss:';
  } catch {
    return false;
  }
}

export type PrintMethod = 'browser' | 'print_server';

/** What is saved for the printing settings: the default address is stored as "nothing". */
export const normalizePrintUrl = (url: string) => (url.trim() === DEFAULT_PRINT_URL ? '' : url.trim());

export const deviceLabelOf = (label: string) => label.trim().slice(0, 100);
