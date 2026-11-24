/**
 * Stand-in for the Node / server-only modules the kh-pos API code imports (fs, path, puppeteer, nodemailer...). On
 * the phone those features are not available: loading is fine, using one throws a clear error.
 */
function unavailable(name) {
  const fail = () => {
    throw new Error(`"${name}" is not available on the phone`);
  };
  return new Proxy(fail, {
    get(_t, key) {
      if (key === '__esModule') return false;
      if (key === 'then' || typeof key === 'symbol') return undefined;
      if (key === 'default') return unavailable(name);
      return unavailable(`${name}.${String(key)}`);
    },
    apply: fail,
    construct: fail,
  });
}
module.exports = unavailable('server module');
