const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @noble/hashes asks for '@noble/hashes/crypto', whose "exports" entry points at './crypto.js', a subpath that
// is not listed, so Metro warns on every bundle and falls back to the file. Point it at that file directly.
const nobleCrypto = path.join(__dirname, 'node_modules', '@noble', 'hashes', 'crypto.js');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@noble/hashes/crypto') return { type: 'sourceFile', filePath: nobleCrypto };
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
