/**
 * Logic tests (API client, cart maths, QR parsing, i18n, and kh-pos on the phone) run in Node with ts-jest.
 * Screens are not unit-tested; they are checked on a phone with Expo Go.
 * @type {import('jest').Config}
 */
const unavailable = '<rootDir>/src/local/shims/unavailable.js';
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    // core/ is the kh-pos-v2 API code (type-checked in kh-pos-v2): compile only
    'kh-pos-mobile.core.+[.]ts$': ['ts-jest', { isolatedModules: true, tsconfig: { esModuleInterop: true, resolveJsonModule: true, module: 'commonjs', target: 'es2022' } }],
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, resolveJsonModule: true, module: 'commonjs' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // ESM-only packages, as CommonJS for Node
    '^uuid$': '<rootDir>/src/local/shims/node-uuid.js',
    '^nanoid$': '<rootDir>/src/local/shims/node-nanoid.js',
    '^lodash-es$': 'lodash',
    // server-only packages the kh-pos API code imports (not installed in the app)
    '^(@vercel/blob|@vercel/functions|exceljs|puppeteer-core|@sparticuz/chromium|nodemailer|multer|qrcode|express)$': unavailable,
  },
};
