const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Convex's generated API lives outside the app's package boundary.
config.watchFolders = [...new Set([...(config.watchFolders || []), path.resolve(__dirname, '../..')])];
module.exports = withNativeWind(config, { input: './global.css' });
