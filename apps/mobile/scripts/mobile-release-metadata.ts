import { createHash } from "node:crypto";

export const MOBILE_UPDATE_METADATA_FILE = "mobile-update-metadata.json";
export const MOBILE_APP_ID = "com.gauravpos.mobile";
// Existing stable and nightly builds use this key. Changing it breaks in-place updates.
export const MOBILE_SIGNING_CERT_SHA256 = "a90484294379cacecf0dd43bed54938ab233e6e211e8e713593c2b699e9f116a";

export interface MobileReleaseMetadata {
  appId: typeof MOBILE_APP_ID;
  versionName: string;
  versionCode: number;
  apkFileName: string;
  sha256: string;
  sizeBytes: number;
}

export function createMobileReleaseMetadata(
  identity: Pick<MobileReleaseMetadata, "versionName" | "versionCode" | "apkFileName">,
  apk: Uint8Array
): MobileReleaseMetadata {
  if (!/^\d+\.\d+\.\d+$/.test(identity.versionName)) throw new Error("Mobile release versionName must be a stable x.y.z version");
  if (!Number.isSafeInteger(identity.versionCode) || identity.versionCode <= 0) throw new Error("Mobile versionCode must be a positive safe integer");
  if (!identity.apkFileName.endsWith(".apk") || /[/\\\r\n]/.test(identity.apkFileName)) throw new Error("Mobile APK name must be a plain .apk filename");
  if (!apk.byteLength) throw new Error("Mobile APK is empty");
  return { appId: MOBILE_APP_ID, versionName: identity.versionName, versionCode: identity.versionCode, apkFileName: identity.apkFileName, sha256: createHash("sha256").update(apk).digest("hex"), sizeBytes: apk.byteLength };
}

export function validateMobileReleaseMetadata(
  value: unknown,
  identity: Pick<MobileReleaseMetadata, "versionName" | "versionCode" | "apkFileName">,
  apk: Uint8Array
): MobileReleaseMetadata {
  if (!value || typeof value !== "object") throw new Error("Mobile update metadata must be an object");
  const expected = createMobileReleaseMetadata(identity, apk);
  for (const key of Object.keys(expected) as Array<keyof MobileReleaseMetadata>) {
    if (Reflect.get(value, key) !== expected[key]) throw new Error(`Mobile update metadata ${key} does not match the APK release`);
  }
  return expected;
}

export function validateMobileApkIdentity(badging: string, signature: string, expected: MobileReleaseMetadata): void {
  const identity = /package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/.exec(badging);
  if (!identity || identity[1] !== expected.appId || identity[2] !== String(expected.versionCode) || identity[3] !== expected.versionName) {
    throw new Error("Built APK package/versionName/versionCode does not match the mobile release");
  }
  const certificate = /Signer #1 certificate SHA-256 digest:\s*([a-f\d]+)/i.exec(signature)?.[1]?.toLowerCase();
  if (certificate !== MOBILE_SIGNING_CERT_SHA256 || !/Number of signers:\s*1\b/.test(signature)) {
    throw new Error("Built APK signing certificate differs from installed stable/nightly apps; refusing an incompatible update");
  }
}
