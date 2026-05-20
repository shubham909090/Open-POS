import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DomainError } from "../domain/errors.js";

const GITHUB_UPDATE_OWNER = "shubham909090";
const GITHUB_UPDATE_REPO = "Open-POS";
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_UPDATE_OWNER}/${GITHUB_UPDATE_REPO}/releases`;

type GithubFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer | SharedArrayBuffer>;
};
type GithubFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<GithubFetchResponse>;

interface GithubReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  name?: string;
  html_url: string;
  published_at?: string;
  body?: string;
  draft: boolean;
  prerelease: boolean;
  assets: GithubReleaseAsset[];
}

type GithubUpdateCheckStatus = "up_to_date" | "update_available" | "unavailable";

interface GithubUpdateCheckResult {
  status: GithubUpdateCheckStatus;
  currentVersion: string;
  latestVersion?: string;
  message?: string;
  release?: {
    tagName: string;
    title: string;
    url: string;
    publishedAt?: string;
    notes: string;
  };
  asset?: {
    name: string;
    sizeBytes: number;
    downloadUrl: string;
  };
  installRequest?: GithubUpdateInstallRequest;
}

interface GithubUpdateInstallRequest {
  tagName: string;
  assetName: string;
  expectedVersion: string;
}

class GithubUpdateSource<TValidatedPackage> {
  constructor(
    private readonly input: {
      updateDir: string;
      appVersion: string;
      githubFetch?: GithubFetch;
      validatePackage: (packagePath: string) => TValidatedPackage;
    }
  ) {}

  async checkLatest(): Promise<GithubUpdateCheckResult> {
    try {
      const candidate = await this.findLatestUpdateAsset();
      if (!candidate) {
        return {
          status: "unavailable",
          currentVersion: this.input.appVersion,
          message: "No stable GitHub release contains a Gaurav POS update package."
        };
      }
      const isNewer = compareVersions(candidate.version, this.input.appVersion) > 0;
      return this.checkResult(candidate, isNewer ? "update_available" : "up_to_date");
    } catch (error) {
      return {
        status: "unavailable",
        currentVersion: this.input.appVersion,
        message: error instanceof Error ? error.message : "GitHub update check failed"
      };
    }
  }

  async downloadLatestPackage(): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    validated: TValidatedPackage;
  } | null> {
    const candidate = await this.findLatestUpdateAsset();
    return candidate ? this.downloadAndValidatePackage(candidate.release, candidate.asset) : null;
  }

  async downloadPinnedPackage(request: GithubUpdateInstallRequest): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    validated: TValidatedPackage;
  } | null> {
    const releases = await this.fetchReleases();
    const release = releases.find((entry) => !entry.draft && !entry.prerelease && entry.tag_name === request.tagName);
    if (!release) throw new DomainError(`Selected GitHub release ${request.tagName} is no longer available`, 404);
    const asset = release.assets.find((entry) => entry.name === request.assetName);
    if (!asset) throw new DomainError(`Selected GitHub update asset ${request.assetName} is no longer available`, 404);
    return this.downloadAndValidatePackage(release, asset);
  }

  private async findLatestUpdateAsset(): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    version: string;
  } | null> {
    const releases = await this.fetchReleases();
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const asset = release.assets.find((entry) => entry.name.endsWith(".gpos-update.zip"));
      if (!asset) continue;
      const version = githubReleaseVersion(release, asset);
      if (!version) throw new DomainError(`GitHub release ${release.tag_name} update asset name does not include a version`, 400);
      return { release, asset, version };
    }
    return null;
  }

  private async downloadAndValidatePackage(release: GithubRelease, asset: GithubReleaseAsset): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    validated: TValidatedPackage;
  }> {
    const packagePath = await this.downloadAsset(asset);
    try {
      const validated = this.input.validatePackage(packagePath);
      return { release, asset, validated };
    } catch (error) {
      throw new DomainError(error instanceof Error ? `GitHub update package is invalid: ${error.message}` : "GitHub update package is invalid", 400);
    }
  }

  private async fetchReleases(): Promise<GithubRelease[]> {
    const fetcher = this.input.githubFetch ?? defaultGithubFetch;
    const response = await fetcher(GITHUB_RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Gaurav-POS-Hub-Updater"
      }
    });
    if (!response.ok) throw new DomainError(`GitHub release check failed: ${response.status} ${response.statusText}`, 502);
    const parsed = await response.json();
    if (!Array.isArray(parsed)) throw new DomainError("GitHub release response was invalid", 502);
    return parsed.map(parseGithubRelease).filter((release): release is GithubRelease => Boolean(release));
  }

  private async downloadAsset(asset: GithubReleaseAsset): Promise<string> {
    if (basename(asset.name) !== asset.name || !asset.name.endsWith(".gpos-update.zip")) {
      throw new DomainError("GitHub release asset has an unsafe update package name", 400);
    }
    const fetcher = this.input.githubFetch ?? defaultGithubFetch;
    const response = await fetcher(asset.browser_download_url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "Gaurav-POS-Hub-Updater"
      }
    });
    if (!response.ok) throw new DomainError(`GitHub update download failed: ${response.status} ${response.statusText}`, 502);
    const bytes = Buffer.from(await response.arrayBuffer());
    const downloadDir = join(this.input.updateDir, "github-downloads");
    mkdirSync(downloadDir, { recursive: true });
    const finalPath = join(downloadDir, asset.name);
    const tempPath = `${finalPath}.part`;
    writeFileSync(tempPath, bytes);
    renameSync(tempPath, finalPath);
    return finalPath;
  }

  private checkResult(
    candidate: { release: GithubRelease; asset: GithubReleaseAsset; version: string },
    status: Exclude<GithubUpdateCheckStatus, "unavailable">
  ): GithubUpdateCheckResult {
    return {
      status,
      currentVersion: this.input.appVersion,
      latestVersion: candidate.version,
      release: {
        tagName: candidate.release.tag_name,
        title: candidate.release.name || candidate.release.tag_name,
        url: candidate.release.html_url,
        publishedAt: candidate.release.published_at,
        notes: summarizeReleaseNotes(candidate.release.body ?? "")
      },
      asset: {
        name: candidate.asset.name,
        sizeBytes: candidate.asset.size,
        downloadUrl: candidate.asset.browser_download_url
      },
      installRequest: {
        tagName: candidate.release.tag_name,
        assetName: candidate.asset.name,
        expectedVersion: candidate.version
      }
    };
  }
}

function parseGithubRelease(value: unknown): GithubRelease | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Record<string, unknown>;
  const assets = Array.isArray(release.assets)
    ? release.assets
        .map((asset) => {
          if (!asset || typeof asset !== "object") return null;
          const record = asset as Record<string, unknown>;
          if (typeof record.name !== "string" || typeof record.browser_download_url !== "string") return null;
          return {
            name: record.name,
            size: typeof record.size === "number" ? record.size : 0,
            browser_download_url: record.browser_download_url
          } satisfies GithubReleaseAsset;
        })
        .filter((asset): asset is GithubReleaseAsset => Boolean(asset))
    : [];
  if (typeof release.tag_name !== "string" || typeof release.html_url !== "string") return null;
  return {
    tag_name: release.tag_name,
    name: typeof release.name === "string" ? release.name : undefined,
    html_url: release.html_url,
    published_at: typeof release.published_at === "string" ? release.published_at : undefined,
    body: typeof release.body === "string" ? release.body : undefined,
    draft: release.draft === true,
    prerelease: release.prerelease === true,
    assets
  };
}

function githubReleaseVersion(release: GithubRelease, asset: GithubReleaseAsset): string | null {
  const assetMatch = asset.name.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)/);
  if (assetMatch?.[1]) return assetMatch[1];
  const tagMatch = release.tag_name.match(/(?:hub-)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)/i);
  return tagMatch?.[1] ?? null;
}

function summarizeReleaseNotes(notes: string): string {
  return notes.trim().replace(/\s+/g, " ").slice(0, 600);
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalizeVersion(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

async function defaultGithubFetch(url: string, init?: { headers?: Record<string, string> }): Promise<GithubFetchResponse> {
  if (typeof fetch !== "function") throw new DomainError("GitHub updates require fetch support in this runtime", 503);
  const response = await fetch(url, init);
  return response;
}

export { GithubUpdateSource, compareVersions };
export type { GithubFetch, GithubFetchResponse, GithubRelease, GithubReleaseAsset, GithubUpdateCheckResult, GithubUpdateCheckStatus, GithubUpdateInstallRequest };
