import { mobileUpdateConfig as config } from "./mobile-update-config";

export interface MobileReleaseAsset {
  name: string;
  url: string;
  sizeBytes: number;
  sha256: string | null;
}

export interface MobileReleaseCandidate {
  tag: string;
  versionName: string;
  apk: MobileReleaseAsset;
  metadata: MobileReleaseAsset;
}

export interface MobileUpdate extends MobileReleaseCandidate {
  versionCode: number;
  sha256: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compareMobileVersions(left: string, right: string): number {
  if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right)) throw new Error("The app version is not a release version.");
  const parts = left.split(".").map(Number);
  const other = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (parts[index] ?? 0) - (other[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isOfficialMobileAsset(url: string, tag: string, name: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com" && !parsed.port && !parsed.username && !parsed.password
      && !parsed.search && !parsed.hash
      && parsed.pathname === `${config.repositoryPath}${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
  } catch { return false; }
}

function parseAsset(value: unknown, tag: string): MobileReleaseAsset | null {
  if (!object(value) || typeof value.name !== "string" || typeof value.browser_download_url !== "string"
    || typeof value.size !== "number" || !Number.isSafeInteger(value.size) || value.size <= 0
    || !isOfficialMobileAsset(value.browser_download_url, tag, value.name)) return null;
  const digest = typeof value.digest === "string" && /^sha256:[a-f\d]{64}$/i.test(value.digest) ? value.digest.slice(7).toLowerCase() : null;
  return { name: value.name, url: value.browser_download_url, sizeBytes: value.size, sha256: digest };
}

// Hub tags and mobile versions deliberately differ. Never compare a Hub version
// to the installed Android version, and never offer drafts or UI nightlies.
export function selectMobileRelease(data: unknown, installedVersion: string): MobileReleaseCandidate | null {
  if (!Array.isArray(data)) throw new Error("The update server returned an invalid release list.");
  let selected: { tag: string; versionName: string; apk: MobileReleaseAsset; assets: MobileReleaseAsset[] } | null = null;
  for (const release of data) {
    if (!object(release) || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string"
      || !/^hub-v\d+\.\d+\.\d+$/.test(release.tag_name) || !Array.isArray(release.assets)) continue;
    const tag = release.tag_name;
    const assets = release.assets.map(value => parseAsset(value, tag)).filter(value => value !== null);
    for (const apk of assets) {
      const match = /^Gaurav-POS-Mobile-(\d+\.\d+\.\d+)\.apk$/.exec(apk.name);
      const versionName = match?.[1];
      if (!versionName || compareMobileVersions(versionName, installedVersion) <= 0) continue;
      if (!selected || compareMobileVersions(versionName, selected.versionName) > 0) selected = { tag, versionName, apk, assets };
    }
  }
  if (!selected) return null;
  if (selected.apk.sizeBytes > config.maxApkBytes) throw new Error("The published mobile update is unexpectedly large.");
  const metadata = selected.assets.find(asset => asset.name === config.metadataFileName);
  if (!metadata || metadata.sizeBytes > config.maxMetadataBytes) throw new Error("The release is missing valid mobile update information. Please try again later.");
  return { tag: selected.tag, versionName: selected.versionName, apk: selected.apk, metadata };
}

export function validateMobileUpdate(candidate: MobileReleaseCandidate, metadata: unknown, installedVersionCode: number): MobileUpdate | null {
  if (!object(metadata) || metadata.appId !== config.appId || metadata.versionName !== candidate.versionName
    || metadata.apkFileName !== candidate.apk.name || typeof metadata.versionCode !== "number"
    || !Number.isSafeInteger(metadata.versionCode) || metadata.versionCode <= 0
    || metadata.sizeBytes !== candidate.apk.sizeBytes || typeof metadata.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(metadata.sha256)) {
    throw new Error("The mobile update information does not match its APK. Installation has been stopped.");
  }
  if (candidate.apk.sha256 && candidate.apk.sha256 !== metadata.sha256.toLowerCase()) throw new Error("The published APK checksums disagree. Installation has been stopped.");
  if (metadata.versionCode <= installedVersionCode) return null;
  return { ...candidate, versionCode: metadata.versionCode, sha256: metadata.sha256.toLowerCase() };
}

export function verifyDownloadedMobileUpdate(update: MobileUpdate, actualBytes: number, actualSha256: string): void {
  if (actualBytes !== update.apk.sizeBytes) throw new Error("The APK download is incomplete. Please download the update again.");
  if (actualSha256.toLowerCase() !== update.sha256) throw new Error("The APK download could not be verified. Please download the update again.");
}
