// Metro config. The only customisation is aliasing the `qrcode` package
// directly to its pure-JS core, because the upstream package's `browser`
// entry point pulls in a canvas renderer that doesn't exist in React Native
// (and its server entry pulls in node's PNG renderer). We only need
// `QRCode.create()` for react-native-qrcode-svg's matrix generation.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const qrcodeCore = path.resolve(__dirname, 'node_modules/qrcode/lib/core/qrcode.js');

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'qrcode') {
    return { filePath: qrcodeCore, type: 'sourceFile' };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
