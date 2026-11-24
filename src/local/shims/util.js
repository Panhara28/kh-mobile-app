/** The parts of Node's `util` knex uses (it only builds SQL on the phone). */
function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      if (typeof fn !== 'function') return reject(new Error('not available on the phone'));
      fn(...args, (err, value) => (err ? reject(err) : resolve(value)));
    });
}
function callbackify(fn) {
  return (...args) => {
    const cb = args.pop();
    Promise.resolve(fn(...args)).then((v) => cb(null, v), (e) => cb(e));
  };
}
function inspect(v) {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function inherits(ctor, superCtor) {
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  Object.setPrototypeOf(ctor, superCtor);
}
const deprecate = (fn) => fn;
const format = (...a) => a.map(inspect).join(' ');
module.exports = { promisify, callbackify, inspect, inherits, deprecate, format, types: {} };
