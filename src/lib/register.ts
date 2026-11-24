/** Register a new store (web /admin/register, POST /api/user/first-user). */
export type RegisterForm = { martName: string; ownerName: string; address: string; phoneNumber: string; userName: string; password: string; confirmPassword: string };
export const EMPTY_REGISTER: RegisterForm = { martName: '', ownerName: '', address: '', phoneNumber: '', userName: '', password: '', confirmPassword: '' };

/** Why the form can't be sent, or null (the web register page's rules). */
export function registerProblem(f: RegisterForm): 'allRequired' | 'tooShort' | 'passwordMismatch' | null {
  if (Object.values(f).some((v) => !v.trim())) return 'allRequired';
  if ([f.martName, f.ownerName, f.userName, f.password].some((v) => v.trim().length < 3)) return 'tooShort';
  if (f.password !== f.confirmPassword) return 'passwordMismatch';
  return null;
}

