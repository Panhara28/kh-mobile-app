/** Node's `crypto`, as far as the kh-pos API code uses it on the phone (random tokens and ids). */
const { getRandomBytes, randomUUID } = require('expo-crypto');

function randomBytes(n) {
  const bytes = getRandomBytes(n);
  return {
    length: bytes.length,
    toString(enc) {
      if (enc && enc !== 'hex') throw new Error(`randomBytes().toString("${enc}") is not available on the phone`);
      let s = '';
      for (const b of bytes) s += (b < 16 ? '0' : '') + b.toString(16);
      return s;
    },
  };
}
const unavailable = require('./unavailable');
module.exports = new Proxy({ randomBytes, randomUUID }, { get: (t, k) => (k in t ? t[k] : unavailable[k]) });
