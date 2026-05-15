type MobilePlatform = "android" | "ios" | "macos" | "windows" | "web";

export function getAndroidStatusBarTopInset(platform: MobilePlatform, statusBarHeight = 0) {
  return platform === "android" ? statusBarHeight : 0;
}
