/** kh-pos server address, from EXPO_PUBLIC_KHPOS_URL (.env.local). No trailing slash. */
export const KHPOS_URL = (process.env.EXPO_PUBLIC_KHPOS_URL ?? '').replace(/\/+$/, '');
