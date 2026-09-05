module.exports = function (api) {
  api.cache(true);
  // Expo 55 owns the automatic JSX and Worklets transforms. Keep NativeWind's
  // createElement interop without installing a second automatic JSX transform.
  const interopPlugin = require('nativewind/babel')().plugins[0];
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: [interopPlugin],
  };
};
