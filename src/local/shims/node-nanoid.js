/** nanoid for the Node test runner (the real package is ESM-only; the phone bundles the real one). */
const crypto = require('node:crypto');
const A = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
module.exports = { nanoid: (size = 21) => Array.from(crypto.randomBytes(size), (b) => A[b & 63]).join('') };
