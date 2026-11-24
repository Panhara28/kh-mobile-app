/** The profile menu of the kh-pos web app: change password rules and the device name. */

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

export const deviceLabelOf = (label: string) => label.trim().slice(0, 100);
