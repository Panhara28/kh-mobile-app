const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @noble/hashes asks for '@noble/hashes/crypto', whose "exports" entry points at './crypto.js', a subpath that
// is not listed, so Metro warns on every bundle and falls back to the file. Point it at that file directly.
const nobleCrypto = path.join(__dirname, 'node_modules', '@noble', 'hashes', 'crypto.js');

// kh-pos on the phone (core/, the kh-pos-v2 API code) and the libraries it brings (knex only builds SQL here) import
// Node and server-only modules. Inside that code they resolve to small phone versions, or to a stand-in that
// throws if used (printing to a network printer, e-mail, PDF, cloud upload: not on the phone).
const shims = path.join(__dirname, 'src', 'local', 'shims');
const SHIMS = {
  util: path.join(shims, 'util.js'),
  assert: path.join(shims, 'assert.js'),
  crypto: path.join(shims, 'crypto.js'),
  'node:crypto': path.join(shims, 'crypto.js'),
  events: require.resolve('events/'),
  timers: path.join(shims, 'timers.js'),
  tty: path.join(shims, 'tty.js'),
};
const UNAVAILABLE = new Set([
  'fs', 'fs/promises', 'path', 'os', 'net', 'tls', 'http', 'https', 'zlib', 'url', 'stream', 'child_process', 'dns', 'dns/promises',
  'node:stream', 'node:async_hooks', 'node:fs', 'node:path', 'node:os', 'node:net',
  'express', 'exceljs', 'puppeteer-core', '@sparticuz/chromium', 'nodemailer', 'multer', 'qrcode', '@vercel/blob', '@vercel/functions',
  // knex database drivers (never loaded: knex has no connection on the phone)
  'pg', 'pg-query-stream', 'pg-connection-string', 'oracledb', 'tedious', 'sqlite3', 'better-sqlite3', 'mysql', 'mysql2', 'mariadb', 'mariadb/callback',
]);
const unavailable = path.join(shims, 'unavailable.js');
const core = path.join(__dirname, 'core') + path.sep;
const isServerCode = (from) =>
  !!from && (from.startsWith(core) || /[\\/]node_modules[\\/](\.pnpm[\\/])?(knex|bcryptjs|dataloader|tarn|debug|getopts|interpret|rechoir|escalade|colorette|get-package-type|pg-connection-string|lodash|commander|resolve-from)[@\\/]/.test(from));

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@noble/hashes/crypto') return { type: 'sourceFile', filePath: nobleCrypto };
  if (isServerCode(context.originModulePath)) {
    if (SHIMS[moduleName]) return { type: 'sourceFile', filePath: SHIMS[moduleName] };
    if (UNAVAILABLE.has(moduleName)) return { type: 'sourceFile', filePath: unavailable };
  }
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
