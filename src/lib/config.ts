/** kh-pos server address, from EXPO_PUBLIC_KHPOS_URL (.env.local). No trailing slash. Only used in server mode. */
export const KHPOS_URL = (process.env.EXPO_PUBLIC_KHPOS_URL ?? '').replace(/\/+$/, '');

/**
 * Where kh-pos runs. "phone" (the default): on this phone, from its own database, with no server (src/local).
 * "server": a kh-pos-v2 server at KHPOS_URL, as before (EXPO_PUBLIC_KHPOS_MODE=server).
 */
export const KHPOS_MODE: 'phone' | 'server' = process.env.EXPO_PUBLIC_KHPOS_MODE === 'server' ? 'server' : 'phone';

/** The address the API client uses for kh-pos on the phone (never leaves the phone). */
export const PHONE_ORIGIN = 'http://phone.local';
