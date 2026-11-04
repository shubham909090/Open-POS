import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  file: { exists: true, size: 89_000_000 },
  hash: vi.fn(),
  startActivity: vi.fn(),
  deleteFile: vi.fn(),
  makeDirectory: vi.fn(),
  contentUri: vi.fn(),
  download: vi.fn(),
  cancelDownload: vi.fn(),
  progress: undefined as undefined | ((event: { totalBytesWritten: number }) => void)
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.14", nativeBuildVersion: "14", applicationId: "com.gauravpos.mobile" }));
vi.mock("../lib/mobile-update-hash", () => ({ hashMobileApk: mocks.hash }));
vi.mock("expo-intent-launcher", () => ({ startActivityAsync: mocks.startActivity, ActivityAction: { MANAGE_UNKNOWN_APP_SOURCES: "android.settings.MANAGE_UNKNOWN_APP_SOURCES" } }));
vi.mock("expo-file-system", () => ({ File: class {
  exists = mocks.file.exists;
  size = mocks.file.size;
} }));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/", makeDirectoryAsync: mocks.makeDirectory, deleteAsync: mocks.deleteFile,
  getContentUriAsync: mocks.contentUri,
  createDownloadResumable: (_url: string, _uri: string, _options: unknown, callback: typeof mocks.progress) => {
    mocks.progress = callback;
    return { downloadAsync: mocks.download, cancelAsync: mocks.cancelDownload };
  }
}));

import { checkMobileUpdate, downloadMobileApk, openMobileInstaller, openMobileInstallPermission } from "../lib/mobile-update-service";
import type { MobileUpdate } from "../lib/mobile-update-release";

const update: MobileUpdate = {
  tag: "hub-v0.1.25", versionName: "0.1.15", versionCode: 15, sha256: "ab".repeat(32),
  apk: { name: "Gaurav-POS-Mobile-0.1.15.apk", url: "https://github.com/shubham909090/Open-POS/releases/download/hub-v0.1.25/Gaurav-POS-Mobile-0.1.15.apk", sizeBytes: 89_000_000, sha256: "ab".repeat(32) },
  metadata: { name: "mobile-update-metadata.json", url: "https://github.com/shubham909090/Open-POS/releases/download/hub-v0.1.25/mobile-update-metadata.json", sizeBytes: 300, sha256: null }
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.file.exists = true;
  mocks.file.size = update.apk.sizeBytes;
  mocks.hash.mockResolvedValue("ab".repeat(32));
  mocks.startActivity.mockResolvedValue({ resultCode: 0 });
  mocks.contentUri.mockResolvedValue("content://com.gauravpos.mobile.FileSystemFileProvider/update.apk");
  mocks.download.mockResolvedValue({ status: 200, uri: "file:///cache/mobile-update/update.apk" });
  mocks.cancelDownload.mockResolvedValue(undefined);
});

describe("mobile APK download and Android handoff", () => {
  it("finds stable updates beyond a full page of nightlies", async () => {
    const jsonResponse = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(Array.from({ length: 100 }, () => ({ prerelease: true }))))
      .mockResolvedValueOnce(jsonResponse([{
        tag_name: update.tag, draft: false, prerelease: false,
        assets: [update.apk, update.metadata].map(asset => ({ name: asset.name, browser_download_url: asset.url, size: asset.sizeBytes }))
      }]))
      .mockResolvedValueOnce(jsonResponse({ appId: "com.gauravpos.mobile", versionName: update.versionName, versionCode: update.versionCode,
        apkFileName: update.apk.name, sizeBytes: update.apk.sizeBytes, sha256: update.sha256 }));
    vi.stubGlobal("fetch", fetch);
    expect(await checkMobileUpdate(new AbortController().signal)).toMatchObject({ versionName: "0.1.15", versionCode: 15 });
    expect(fetch.mock.calls[1]?.[0]).toContain("page=2");
  });

  it("reports an incomplete release check instead of falsely saying up to date", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200,
      text: async () => JSON.stringify(Array.from({ length: 100 }, () => ({ prerelease: true }))) });
    vi.stubGlobal("fetch", fetch);
    await expect(checkMobileUpdate(new AbortController().signal)).rejects.toThrow("Could not finish checking");
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("downloads to app cache with progress, then verifies before opening the system installer", async () => {
    mocks.download.mockImplementation(async () => {
      mocks.progress?.({ totalBytesWritten: update.apk.sizeBytes / 2 });
      return { status: 200, uri: "file:///cache/mobile-update/update.apk" };
    });
    const signal = new AbortController().signal;
    const progress = vi.fn();
    const verifying = vi.fn();
    const uri = await downloadMobileApk(update, signal, progress, verifying);
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(verifying).toHaveBeenCalledOnce();
    expect(mocks.cancelDownload).toHaveBeenCalledOnce();
    expect(mocks.startActivity).not.toHaveBeenCalled();
    await openMobileInstaller(update, uri, signal);
    expect(mocks.hash).toHaveBeenCalledWith(expect.objectContaining({ exists: true, size: update.apk.sizeBytes }), signal);
    expect(mocks.startActivity).toHaveBeenCalledWith("android.intent.action.VIEW", {
      data: "content://com.gauravpos.mobile.FileSystemFileProvider/update.apk",
      type: "application/vnd.android.package-archive", flags: 1
    });
  });

  it("blocks partial APKs before hashing or invoking the installer", async () => {
    mocks.file.size--;
    await expect(openMobileInstaller(update, "file:///cache/update.apk", new AbortController().signal)).rejects.toThrow("incomplete");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.startActivity).not.toHaveBeenCalled();
  });

  it("releases the native progress listener after a failed download", async () => {
    mocks.download.mockRejectedValue(new Error("Network unavailable"));
    await expect(downloadMobileApk(update, new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow("Network unavailable");
    expect(mocks.cancelDownload).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenLastCalledWith("file:///cache/mobile-update/update.apk", { idempotent: true });
  });

  it("blocks modified cached APKs on every installer retry", async () => {
    mocks.hash.mockResolvedValue("cd".repeat(32));
    await expect(openMobileInstaller(update, "file:///cache/update.apk", new AbortController().signal)).rejects.toThrow("could not be verified");
    expect(mocks.startActivity).not.toHaveBeenCalled();
  });

  it("deletes an interrupted download and never starts installation", async () => {
    const controller = new AbortController();
    mocks.download.mockImplementation(async () => { controller.abort(); return undefined; });
    await expect(downloadMobileApk(update, controller.signal, vi.fn(), vi.fn())).rejects.toThrow("cancelled");
    expect(mocks.cancelDownload).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenLastCalledWith("file:///cache/mobile-update/update.apk", { idempotent: true });
    expect(mocks.startActivity).not.toHaveBeenCalled();
  });

  it("cancels an oversized response and stops before installer handoff", async () => {
    mocks.download.mockImplementation(async () => { mocks.progress?.({ totalBytesWritten: update.apk.sizeBytes + 1 }); return undefined; });
    await expect(downloadMobileApk(update, new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow("does not match");
    expect(mocks.cancelDownload).toHaveBeenCalledOnce();
    expect(mocks.startActivity).not.toHaveBeenCalled();
  });

  it("only opens install-source settings on an explicit separate action", async () => {
    await openMobileInstallPermission();
    expect(mocks.startActivity).toHaveBeenCalledWith("android.settings.MANAGE_UNKNOWN_APP_SOURCES", { data: "package:com.gauravpos.mobile" });
  });
});
