/**
 * The same new-store journey, with the Node modules the kh-pos code (and knex) import replaced by what the phone
 * bundle gives them (metro.config.js -> src/local/shims): catches a feature that would only break on the phone.
 */
import { newStoreJourney } from './journey';


jest.mock('util', () => jest.requireActual('./shims/util.js'));
jest.mock('assert', () => jest.requireActual('./shims/assert.js'));
jest.mock('tty', () => jest.requireActual('./shims/tty.js'));
jest.mock('timers', () => jest.requireActual('./shims/timers.js'));
jest.mock('expo-crypto', () => {
  const c = jest.requireActual('node:crypto');
  return { getRandomBytes: (n: number) => new Uint8Array(c.randomBytes(n)), randomUUID: () => c.randomUUID(), getRandomValues: (a: Uint8Array) => c.getRandomValues(a) };
});
jest.mock('crypto', () => jest.requireActual('./shims/crypto.js'));
jest.mock('debug', () => jest.requireActual('debug/src/browser.js')); // the phone bundles debug's browser build
for (const m of ['fs', 'fs/promises', 'path', 'os', 'net', 'stream', 'url', 'child_process', 'dns/promises']) jest.mock(m, () => jest.requireActual('./shims/unavailable.js'));

newStoreJourney('kh-pos on the phone, with the phone stand-ins for Node modules');
