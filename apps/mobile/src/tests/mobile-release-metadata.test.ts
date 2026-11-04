import { describe, expect, it } from "vitest";
import { createMobileReleaseMetadata, MOBILE_APP_ID, MOBILE_SIGNING_CERT_SHA256, validateMobileApkIdentity, validateMobileReleaseMetadata } from "../../scripts/mobile-release-metadata";

const identity = { versionName: "0.1.15", versionCode: 15, apkFileName: "Gaurav-POS-Mobile-0.1.15.apk" };
const apk = Buffer.from("test APK bytes");
const badging = "package: name='com.gauravpos.mobile' versionCode='15' versionName='0.1.15' platformBuildVersionName='16'";
const manifest = "E: manifest (line=1)\n  E: application (line=10)";
const signature = `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${MOBILE_SIGNING_CERT_SHA256}`;

describe("mobile release metadata", () => {
  it("binds the mobile identity, byte size and hash independently of the Hub tag version", () => {
    const metadata = createMobileReleaseMetadata(identity, apk);
    expect(metadata).toMatchObject({ appId: MOBILE_APP_ID, ...identity, sizeBytes: apk.byteLength });
    expect(metadata.sha256).toMatch(/^[a-f\d]{64}$/);
    expect(validateMobileReleaseMetadata(metadata, identity, apk)).toEqual(metadata);
  });

  it("rejects a substituted/truncated APK and stale release metadata", () => {
    const metadata = createMobileReleaseMetadata(identity, apk);
    expect(() => validateMobileReleaseMetadata(metadata, identity, apk.subarray(1))).toThrow("sha256");
    for (const patch of [{ appId: "other.app" }, { versionName: "0.1.14" }, { versionCode: 14 }, { apkFileName: "other.apk" }, { sizeBytes: 1 }]) {
      expect(() => validateMobileReleaseMetadata({ ...metadata, ...patch }, identity, apk)).toThrow("does not match");
    }
  });

  it("rejects invalid stable versions, install codes and unsafe filenames", () => {
    for (const patch of [{ versionName: "0.1.15-nightly" }, { versionCode: 0 }, { versionCode: 1.5 }, { apkFileName: "../app.apk" }, { apkFileName: "a\\app.apk" }, { apkFileName: "app.apk\nother" }]) {
      expect(() => createMobileReleaseMetadata({ ...identity, ...patch }, apk)).toThrow();
    }
    expect(() => createMobileReleaseMetadata(identity, new Uint8Array())).toThrow("empty");
  });

  it("requires actual APK identity and the existing install signing key", () => {
    const metadata = createMobileReleaseMetadata(identity, apk);
    expect(() => validateMobileApkIdentity(badging, signature, metadata, manifest)).not.toThrow();
    expect(() => validateMobileApkIdentity(badging.replace("versionCode='15'", "versionCode='14'"), signature, metadata, manifest)).toThrow("package/versionName/versionCode");
    expect(() => validateMobileApkIdentity(badging, signature.replace(MOBILE_SIGNING_CERT_SHA256, "0".repeat(64)), metadata, manifest)).toThrow("signing certificate");
    expect(() => validateMobileApkIdentity(badging, signature.replace("signers: 1", "signers: 2"), metadata, manifest)).toThrow("signing certificate");
  });
  it("rejects test-only and debuggable APK manifests", () => {
    const metadata = createMobileReleaseMetadata(identity, apk);
    for (const flag of ["testOnly", "debuggable"]) {
      expect(() => validateMobileApkIdentity(badging, signature, metadata, `${manifest}\n    A: android:${flag}(0x01010272)=(type 0x12)0xffffffff`)).toThrow(flag);
      expect(() => validateMobileApkIdentity(badging, signature, metadata, `${manifest}\n    A: android:${flag}(0x01010272)=(type 0x12)0x0`)).not.toThrow();
    }
    expect(() => validateMobileApkIdentity(badging, signature, metadata, "")).toThrow("manifest");
  });
});
