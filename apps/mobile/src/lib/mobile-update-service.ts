import { Platform } from "react-native";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { mobileUpdateConfig as config } from "./mobile-update-config";
import { selectMobileRelease, validateMobileUpdate, verifyDownloadedMobileUpdate, type MobileUpdate } from "./mobile-update-release";
import { hashMobileApk } from "./mobile-update-hash";

export const installedMobileVersion = {
  versionName: Application.nativeApplicationVersion ?? "",
  versionCode: Number(Application.nativeBuildVersion ?? 0)
};

export const mobileUpdatesSupported = Platform.OS === "android" && Application.applicationId === config.appId;

async function requestJson(url: string, signal: AbortSignal, maxCharacters?: number): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(abort, config.requestTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/vnd.github+json" } });
    if (response.status === 403 || response.status === 429) throw new Error("GitHub is limiting update checks. Please try again later.");
    if (!response.ok) throw new Error("Could not check the official mobile release. Please try again.");
    const text = await response.text();
    if (maxCharacters && text.length > maxCharacters) throw new Error("The update information is invalid.");
    try { return JSON.parse(text); }
    catch { throw new Error("The update server returned invalid release information. Please try again later."); }
  } catch (error) {
    if (!signal.aborted && controller.signal.aborted) throw new Error("The update check took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function checkMobileUpdate(signal: AbortSignal): Promise<MobileUpdate | null> {
  if (!mobileUpdatesSupported) throw new Error("Updates are available in the installed Android app.");
  if (!Number.isSafeInteger(installedMobileVersion.versionCode) || installedMobileVersion.versionCode <= 0) throw new Error("The installed app build could not be identified.");
  const releases = await requestJson(config.releasesUrl, signal);
  const candidate = selectMobileRelease(releases, installedMobileVersion.versionName);
  if (!candidate) return null;
  const metadata = await requestJson(candidate.metadata.url, signal, config.maxMetadataBytes);
  return validateMobileUpdate(candidate, metadata, installedMobileVersion.versionCode);
}

function assertNotCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Update download cancelled.");
}

export async function verifyMobileApk(update: MobileUpdate, uri: string, signal: AbortSignal): Promise<void> {
  assertNotCancelled(signal);
  const file = new File(uri);
  if (!file.exists || file.size !== update.apk.sizeBytes) throw new Error("The APK download is incomplete. Please download the update again.");
  const sha256 = await hashMobileApk(file, signal);
  assertNotCancelled(signal);
  verifyDownloadedMobileUpdate(update, file.size, sha256);
}

export async function downloadMobileApk(
  update: MobileUpdate,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
  onVerifying: () => void
): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error("The phone's download storage is unavailable.");
  const directory = `${FileSystem.cacheDirectory}mobile-update/`;
  const uri = `${directory}update.apk`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  assertNotCancelled(signal);
  await FileSystem.deleteAsync(uri, { idempotent: true });
  let tooLarge = false;
  const task = FileSystem.createDownloadResumable(update.apk.url, uri, {}, progress => {
    if (progress.totalBytesWritten > update.apk.sizeBytes) {
      tooLarge = true;
      void task.cancelAsync().catch(() => {});
      return;
    }
    if (!signal.aborted) onProgress(Math.min(1, Math.max(0, progress.totalBytesWritten / update.apk.sizeBytes)));
  });
  const cancel = () => { void task.cancelAsync().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, config.downloadTimeoutMs);
  try {
    assertNotCancelled(signal);
    const result = await task.downloadAsync();
    assertNotCancelled(signal);
    if (tooLarge) throw new Error("The APK download does not match the release. Please try again later.");
    if (!result || result.status !== 200) throw new Error("The APK download did not finish. Please try again.");
    onVerifying();
    const file = new File(result.uri);
    if (!file.exists || file.size !== update.apk.sizeBytes) throw new Error("The APK download is incomplete. Please download the update again.");
    return result.uri;
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

export async function openMobileInstaller(update: MobileUpdate, uri: string, signal: AbortSignal, onVerified?: () => void): Promise<void> {
  if (!mobileUpdatesSupported) throw new Error("Install this update on an Android phone.");
  // Recheck the cached APK before every retry, including after returning from
  // Android's install-source permission screen. Android verifies its signature.
  await verifyMobileApk(update, uri, signal);
  onVerified?.();
  const contentUri = await FileSystem.getContentUriAsync(uri);
  assertNotCancelled(signal);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: config.apkMimeType,
    flags: 1 // FLAG_GRANT_READ_URI_PERMISSION; never grant persistent access.
  });
}

export async function openMobileInstallPermission(): Promise<void> {
  if (!mobileUpdatesSupported) throw new Error("Install permissions are available on Android.");
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, { data: `package:${config.appId}` });
}
