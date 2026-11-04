import { describe, expect, it } from "vitest";
import { compareMobileVersions, isOfficialMobileAsset, selectMobileRelease, validateMobileUpdate, verifyDownloadedMobileUpdate } from "../lib/mobile-update-release";

const checksum = "ab".repeat(32);
function release(hubVersion: string, mobileVersion: string, extras = {}) {
  const tag = `hub-v${hubVersion}`;
  const apkName = `Gaurav-POS-Mobile-${mobileVersion}.apk`;
  const asset = (name: string, size: number) => ({ name, size, digest: `sha256:${checksum}`,
    browser_download_url: `https://github.com/shubham909090/Open-POS/releases/download/${tag}/${name}` });
  return { tag_name: tag, draft: false, prerelease: false, assets: [asset(apkName, 89_000_000), asset("mobile-update-metadata.json", 300)], ...extras };
}
function candidate() {
  const result = selectMobileRelease([release("0.1.25", "0.1.15")], "0.1.14");
  if (!result) throw new Error("Expected update");
  return result;
}
const metadata = { appId: "com.gauravpos.mobile", versionName: "0.1.15", versionCode: 15,
  apkFileName: "Gaurav-POS-Mobile-0.1.15.apk", sha256: checksum, sizeBytes: 89_000_000 };

describe("official mobile release selection", () => {
  it("compares mobile versions independently of Hub tags, with numeric ordering", () => {
    const selected = selectMobileRelease([release("0.1.99", "0.1.9"), release("0.1.25", "0.1.15"), release("0.1.26", "0.1.14")], "0.1.12");
    expect(selected?.versionName).toBe("0.1.15");
    expect(selected?.tag).toBe("hub-v0.1.25");
    expect(compareMobileVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
  });

  it("excludes nightly and draft releases, even when newer", () => {
    expect(selectMobileRelease([release("0.1.30", "0.1.20", { draft: true }), release("0.1.29", "0.1.19", { prerelease: true }), release("0.1.25", "0.1.15")], "0.1.14")?.versionName).toBe("0.1.15");
  });

  it("never offers an equal or older mobile version and ignores legacy metadata absence", () => {
    expect(selectMobileRelease([release("0.1.25", "0.1.15"), release("0.1.26", "0.1.14")], "0.1.15")).toBeNull();
    const old = release("0.1.23", "0.1.13");
    old.assets = old.assets.slice(0, 1);
    expect(selectMobileRelease([release("0.1.25", "0.1.15"), old], "0.1.12")?.versionName).toBe("0.1.15");
  });

  it("rejects other repositories, schemes, credentials, query strings, and filename mismatches", () => {
    const good = candidate();
    expect(isOfficialMobileAsset(good.apk.url, good.tag, good.apk.name)).toBe(true);
    for (const url of [good.apk.url.replace("https:", "http:"), good.apk.url.replace("github.com/", "github.com@evil.test/"), good.apk.url.replace("Open-POS", "Other"), `${good.apk.url}?token=anything`, good.apk.url.replace(".apk", ".zip")]) {
      expect(isOfficialMobileAsset(url, good.tag, good.apk.name)).toBe(false);
    }
  });

  it("requires metadata for the selected release rather than silently offering an older APK", () => {
    const newest = release("0.1.25", "0.1.15");
    newest.assets = newest.assets.slice(0, 1);
    expect(() => selectMobileRelease([newest, release("0.1.23", "0.1.13")], "0.1.12")).toThrow("missing valid mobile update information");
  });

  it("validates app identity, actual Android build code, APK size, and checksums", () => {
    expect(validateMobileUpdate(candidate(), metadata, 14)?.versionCode).toBe(15);
    expect(validateMobileUpdate(candidate(), metadata, 15)).toBeNull();
    expect(validateMobileUpdate(candidate(), metadata, 16)).toBeNull();
    for (const bad of [{ appId: "other.app" }, { versionName: "0.1.16" }, { versionCode: 1.5 }, { sizeBytes: 1 }, { apkFileName: "another.apk" }, { sha256: "cd".repeat(32) }]) {
      expect(() => validateMobileUpdate(candidate(), { ...metadata, ...bad }, 14)).toThrow();
    }
  });

  it("blocks partial and modified APK downloads before installer handoff", () => {
    const update = validateMobileUpdate(candidate(), metadata, 14);
    if (!update) throw new Error("Expected update");
    expect(() => verifyDownloadedMobileUpdate(update, metadata.sizeBytes - 1, checksum)).toThrow("incomplete");
    expect(() => verifyDownloadedMobileUpdate(update, metadata.sizeBytes, "cd".repeat(32))).toThrow("could not be verified");
    expect(() => verifyDownloadedMobileUpdate(update, metadata.sizeBytes, checksum.toUpperCase())).not.toThrow();
  });
});
