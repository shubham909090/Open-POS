const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

module.exports = function withAndroidRuntime(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    // React Native handles these changes in place. Activity recreation otherwise
    // leaves Expo picker result launchers unregistered until a process restart.
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(configWithManifest.modResults);
    const changes = new Set((activity.$["android:configChanges"] ?? "").split("|").filter(Boolean));
    changes.add("fontScale");
    changes.add("density");
    activity.$["android:configChanges"] = [...changes].join("|");
    return configWithManifest;
  });
};
