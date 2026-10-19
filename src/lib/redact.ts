/**
 * kh-pos puts whole user records (with their login `token`) inside orders, groups and other rows.
 * Nothing in the app needs another person's token, and cached copies live on the phone, so every
 * `token` key is removed from a server answer before it is used or saved.
 */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'token') continue;
      out[k] = stripSecrets(v);
    }
    return out as T;
  }
  return value;
}
