/** Node's `assert`, as far as knex uses it. */
function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion failed');
}
assert.ok = assert;
assert.strictEqual = (a, b, message) => assert(a === b, message);
assert.equal = (a, b, message) => assert(a == b, message); // eslint-disable-line eqeqeq
module.exports = assert;
