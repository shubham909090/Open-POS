import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { readAppMetadata } from "../app-metadata.js";
import type { BackupService, BackupSummary } from "../db/backup-service.js";
import type { HubDatabase } from "../db/database.js";
import { DomainError } from "../domain/errors.js";
import type { UpdatePackageManifest } from "./update-package.js";
import { PACKAGED_SQLITE_NATIVE_PATH, UPDATE_APP_ID, sha256, validateUpdatePackage, validateWindowsX64NativeModule } from "./update-package.js";

const STATE_FILE = "app-update-state.json";
const GITHUB_UPDATE_OWNER = "shubham909090";
const GITHUB_UPDATE_REPO = "Open-POS";
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_UPDATE_OWNER}/${GITHUB_UPDATE_REPO}/releases`;
const require = createRequire(import.meta.url);

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

export interface CachedUpdatePackage {
  version: string;
  packagePath: string;
  installerPath: string;
  manifest: UpdatePackageManifest;
  cachedAt: string;
}

export interface RollbackPackage extends CachedUpdatePackage {
  preUpdateBackupFileName: string;
  preUpdateBackupPath: string;
  preparedAt: string;
}

export interface AppUpdateState {
  current?: CachedUpdatePackage;
  pending?: CachedUpdatePackage;
  previous?: RollbackPackage;
  recoveryScriptPath?: string;
}

export interface AppUpdateStatus {
  appVersion: string;
  dbSchemaVersion: number;
  activeOrderCount: number;
  baselineRegistered: boolean;
  rollbackAvailable: boolean;
  current?: CachedUpdatePackage;
  pending?: CachedUpdatePackage;
  previous?: RollbackPackage;
  recoveryScriptPath?: string;
}

export type GithubUpdateCheckStatus = "up_to_date" | "update_available" | "unavailable";

export interface GithubUpdateCheckResult {
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

export interface GithubUpdateInstallRequest {
  tagName: string;
  assetName: string;
  expectedVersion: string;
}

export interface ValidatedPackageResult {
  ok: true;
  packagePath: string;
  packageFileName: string;
  manifest: UpdatePackageManifest;
}

export class AppUpdateService {
  constructor(
    private readonly input: {
      database: HubDatabase;
      backupService: BackupService;
      updateDir: string;
      appVersion: string;
      dbSchemaVersion: number;
      databasePath: string;
      sqliteNativePath?: string;
      githubFetch?: GithubFetch;
      launchInstaller?: (installerPath: string) => Promise<void> | void;
      exitApp?: () => void;
    }
  ) {
    mkdirSync(this.input.updateDir, { recursive: true });
    this.completePendingInstall();
  }

  status(): AppUpdateStatus {
    const state = this.readState();
    return {
      appVersion: this.input.appVersion,
      dbSchemaVersion: this.input.dbSchemaVersion,
      activeOrderCount: this.activeOrderCount(),
      baselineRegistered: state.current?.version === this.input.appVersion,
      rollbackAvailable: Boolean(state.previous && existsSync(state.previous.installerPath) && existsSync(state.previous.preUpdateBackupPath)),
      ...state
    };
  }

  validatePackage(packagePath: string): ValidatedPackageResult {
    const result = this.validatePackageForCurrentDb(packagePath);
    return { ok: true, packagePath, packageFileName: result.packageFileName, manifest: result.manifest };
  }

  registerBaseline(packagePath: string): CachedUpdatePackage {
    const validated = this.validatePackageForCurrentDb(packagePath);
    if (validated.manifest.version !== this.input.appVersion) {
      throw new DomainError(`Baseline package version ${validated.manifest.version} does not match running app ${this.input.appVersion}`, 400);
    }
    const cached = this.cachePackage(validated);
    this.writeState({ ...this.readState(), current: cached });
    return cached;
  }

  registerInstallerBaseline(installerPath: string): CachedUpdatePackage {
    const expectedName = `Gaurav POS Hub Setup ${this.input.appVersion}.exe`;
    if (basename(installerPath) !== expectedName) {
      throw new DomainError(`Installer ${basename(installerPath)} does not match running app ${this.input.appVersion}`, 400);
    }
    const installerBytes = readBaselineFile(installerPath, "Current installer");
    if (installerBytes.length < 2 || installerBytes.toString("ascii", 0, 2) !== "MZ") {
      throw new DomainError("Current installer is not a Windows executable", 400);
    }

    let sqliteNativePath: string;
    try {
      sqliteNativePath = this.input.sqliteNativePath ?? resolveInstalledSqliteNativePath();
    } catch {
      throw new DomainError("Installed SQLite native binary is missing", 400);
    }
    const sqliteNativeBytes = readBaselineFile(sqliteNativePath, "Installed SQLite native binary");
    try {
      validateWindowsX64NativeModule(sqliteNativeBytes);
    } catch (error) {
      throw new DomainError(error instanceof Error ? error.message : "Installed SQLite native validation failed", 400);
    }

    // Baseline installers are rollback anchors for the already-running app.
    // Update packages still perform strict installer content inspection before install.
    const metadata = readAppMetadata();
    const manifest: UpdatePackageManifest = {
      schemaVersion: 1,
      appId: UPDATE_APP_ID,
      productName: metadata.productName,
      version: this.input.appVersion,
      platform: "win32",
      arch: "x64",
      electronVersion: metadata.electronVersion,
      dbSchemaVersion: this.input.dbSchemaVersion,
      minSourceDbSchemaVersion: 0,
      createdAt: new Date().toISOString(),
      installer: {
        fileName: expectedName,
        sha256: sha256(installerBytes),
        sizeBytes: installerBytes.length
      },
      sqliteNative: {
        fileName: PACKAGED_SQLITE_NATIVE_PATH,
        sha256: sha256(sqliteNativeBytes),
        sizeBytes: sqliteNativeBytes.length,
        format: "pe32plus-x64"
      }
    };
    const cached = this.cacheInstallerBaseline(installerPath, manifest);
    this.writeState({ ...this.readState(), current: cached });
    return cached;
  }

  async installUpdate(packagePath: string): Promise<{ installing: true; backup: BackupSummary; package: CachedUpdatePackage; recoveryScriptPath: string }> {
    const state = this.readState();
    if (state.current?.version !== this.input.appVersion) {
      throw new DomainError("Register the current app package before installing updates", 400);
    }
    const activeOrderCount = this.activeOrderCount();
    if (activeOrderCount > 0) throw new DomainError(`Close or settle ${activeOrderCount} running order(s) before installing update`, 400);

    const validated = this.validatePackageForCurrentDb(packagePath);
    this.input.database.integrityCheck();
    const backup = await this.input.backupService.createBackup(`pre-update-${this.input.appVersion}-to-${validated.manifest.version}`);
    const pending = this.cachePackage(validated);
    const previous: RollbackPackage = {
      ...state.current,
      preUpdateBackupFileName: backup.fileName,
      preUpdateBackupPath: backup.path,
      preparedAt: new Date().toISOString()
    };
    const recoveryScriptPath = this.writeRecoveryScript(previous);
    this.writeState({ ...state, pending, previous, recoveryScriptPath });
    await this.launchAndExit(pending.installerPath);
    return { installing: true, backup, package: pending, recoveryScriptPath };
  }

  async rollback(): Promise<{ rollingBack: true; package: RollbackPackage }> {
    const state = this.readState();
    if (!state.previous) throw new DomainError("No rollback package is available", 400);
    if (!existsSync(state.previous.installerPath)) throw new DomainError("Previous installer is missing", 400);
    if (!existsSync(state.previous.preUpdateBackupPath)) throw new DomainError("Pre-update database backup is missing", 400);
    const recoveryScriptPath = state.recoveryScriptPath && existsSync(state.recoveryScriptPath) ? state.recoveryScriptPath : this.writeRecoveryScript(state.previous);
    await this.launchAndExit(recoveryScriptPath);
    return { rollingBack: true, package: state.previous };
  }

  async checkGithubLatest(): Promise<GithubUpdateCheckResult> {
    try {
      const candidate = await this.findLatestGithubUpdateAsset();
      if (!candidate) {
        return {
          status: "unavailable",
          currentVersion: this.input.appVersion,
          message: "No stable GitHub release contains a Gaurav POS update package."
        };
      }
      const isNewer = compareVersions(candidate.version, this.input.appVersion) > 0;
      return this.githubCheckResult(candidate, isNewer ? "update_available" : "up_to_date");
    } catch (error) {
      return {
        status: "unavailable",
        currentVersion: this.input.appVersion,
        message: error instanceof Error ? error.message : "GitHub update check failed"
      };
    }
  }

  async installGithubUpdate(request?: GithubUpdateInstallRequest): Promise<{ installing: true; backup: BackupSummary; package: CachedUpdatePackage; recoveryScriptPath: string }> {
    const state = this.readState();
    if (state.current?.version !== this.input.appVersion) {
      throw new DomainError("Register the current app package before installing updates", 400);
    }
    const activeOrderCount = this.activeOrderCount();
    if (activeOrderCount > 0) throw new DomainError(`Close or settle ${activeOrderCount} running order(s) before installing update`, 400);
    const candidate = request
      ? await this.downloadPinnedGithubPackage(request)
      : await this.downloadLatestGithubPackage();
    if (!candidate) throw new DomainError("No stable GitHub release contains a Gaurav POS update package", 404);
    if (request && candidate.validated.manifest.version !== request.expectedVersion) {
      throw new DomainError(`GitHub update package version ${candidate.validated.manifest.version} does not match selected version ${request.expectedVersion}`, 400);
    }
    if (compareVersions(candidate.validated.manifest.version, this.input.appVersion) <= 0) {
      throw new DomainError(`Gaurav POS Hub is already up to date (${this.input.appVersion})`, 400);
    }
    return this.installUpdate(candidate.validated.packagePath);
  }

  private cachePackage(validated: ReturnType<typeof validateUpdatePackage>): CachedUpdatePackage {
    const cacheRoot = this.safeCacheRoot(validated.manifest.version);
    mkdirSync(cacheRoot, { recursive: true });
    const packagePath = join(cacheRoot, validated.packageFileName);
    const installerPath = join(cacheRoot, validated.manifest.installer.fileName);
    copyFileSync(validated.packagePath, packagePath);
    writeFileSync(installerPath, validated.installerBytes);
    return {
      version: validated.manifest.version,
      packagePath,
      installerPath,
      manifest: validated.manifest,
      cachedAt: new Date().toISOString()
    };
  }

  private cacheInstallerBaseline(sourceInstallerPath: string, manifest: UpdatePackageManifest): CachedUpdatePackage {
    const cacheRoot = this.safeCacheRoot(manifest.version);
    mkdirSync(cacheRoot, { recursive: true });
    const installerPath = join(cacheRoot, manifest.installer.fileName);
    copyFileSync(sourceInstallerPath, installerPath);
    return {
      version: manifest.version,
      packagePath: installerPath,
      installerPath,
      manifest,
      cachedAt: new Date().toISOString()
    };
  }

  private validatePackageForCurrentDb(packagePath: string): ReturnType<typeof validateUpdatePackage> {
    try {
      return validateUpdatePackage(packagePath, this.input.dbSchemaVersion);
    } catch (error) {
      throw new DomainError(error instanceof Error ? error.message : "Update package is invalid", 400);
    }
  }

  private async findLatestGithubUpdateAsset(): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    version: string;
  } | null> {
    const releases = await this.fetchGithubReleases();
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

  private async downloadLatestGithubPackage(): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    validated: ReturnType<typeof validateUpdatePackage>;
  } | null> {
    const candidate = await this.findLatestGithubUpdateAsset();
    return candidate ? this.downloadAndValidateGithubPackage(candidate.release, candidate.asset) : null;
  }

  private async downloadPinnedGithubPackage(request: GithubUpdateInstallRequest): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    validated: ReturnType<typeof validateUpdatePackage>;
  } | null> {
    const releases = await this.fetchGithubReleases();
    const release = releases.find((entry) => !entry.draft && !entry.prerelease && entry.tag_name === request.tagName);
    if (!release) throw new DomainError(`Selected GitHub release ${request.tagName} is no longer available`, 404);
    const asset = release.assets.find((entry) => entry.name === request.assetName);
    if (!asset) throw new DomainError(`Selected GitHub update asset ${request.assetName} is no longer available`, 404);
    return this.downloadAndValidateGithubPackage(release, asset);
  }

  private async downloadAndValidateGithubPackage(release: GithubRelease, asset: GithubReleaseAsset): Promise<{
    release: GithubRelease;
    asset: GithubReleaseAsset;
    validated: ReturnType<typeof validateUpdatePackage>;
  }> {
    const packagePath = await this.downloadGithubAsset(asset);
    try {
      const validated = this.validatePackageForCurrentDb(packagePath);
      return { release, asset, validated };
    } catch (error) {
      throw new DomainError(error instanceof Error ? `GitHub update package is invalid: ${error.message}` : "GitHub update package is invalid", 400);
    }
  }

  private async fetchGithubReleases(): Promise<GithubRelease[]> {
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

  private async downloadGithubAsset(asset: GithubReleaseAsset): Promise<string> {
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

  private githubCheckResult(
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

  private completePendingInstall(): void {
    const state = this.readState();
    if (!state.pending || state.pending.version !== this.input.appVersion) return;
    this.writeState({ ...state, current: state.pending, pending: undefined });
  }

  private activeOrderCount(): number {
    const row = this.input.database.db
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('open', 'billed')")
      .get() as { count: number };
    return row.count;
  }

  private async launchAndExit(installerPath: string): Promise<void> {
    if (this.input.launchInstaller) await this.input.launchInstaller(installerPath);
    else {
      const child = spawn(installerPath, [], { detached: true, stdio: "ignore", shell: extname(installerPath).toLowerCase() === ".cmd" });
      child.unref();
    }
    if (this.input.exitApp) this.input.exitApp();
  }

  private safeCacheRoot(version: string): string {
    const cacheRoot = resolve(this.input.updateDir, "packages", version);
    const packagesRoot = resolve(this.input.updateDir, "packages");
    if (!cacheRoot.startsWith(`${packagesRoot}${separator()}`)) throw new DomainError("Update version contains an unsafe path", 400);
    return cacheRoot;
  }

  private readState(): AppUpdateState {
    const path = this.statePath();
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as AppUpdateState;
    } catch {
      rmSync(path, { force: true });
      return {};
    }
  }

  private writeState(state: AppUpdateState): void {
    mkdirSync(dirname(this.statePath()), { recursive: true });
    writeFileSync(this.statePath(), JSON.stringify(state, null, 2));
  }

  private statePath(): string {
    return join(this.input.updateDir, STATE_FILE);
  }

  private writeRecoveryScript(previous: RollbackPackage): string {
    const scriptPath = join(this.input.updateDir, "Rollback Gaurav POS Update.cmd");
    const databasePath = this.input.databasePath;
    const backupPath = previous.preUpdateBackupPath;
    const installerPath = previous.installerPath;
    const script = [
      "@echo off",
      "setlocal",
      `set "GPOS_PARENT_PID=${process.pid}"`,
      "echo Waiting for Gaurav POS Hub to close before restoring the database...",
      powershellCommand("Wait-Process -Id $env:GPOS_PARENT_PID -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 300"),
      "echo Restoring Gaurav POS pre-update database backup...",
      powershellCommand(`Remove-Item -Force -ErrorAction SilentlyContinue ${psQuote(`${databasePath}-wal`)},${psQuote(`${databasePath}-shm`)},${psQuote(`${databasePath}-journal`)}`),
      powershellCommand(`Copy-Item -Force ${psQuote(backupPath)} ${psQuote(databasePath)}`),
      "echo Launching previous Gaurav POS installer...",
      powershellCommand(`Start-Process -FilePath ${psQuote(installerPath)}`),
      "echo Rollback started. You can close this window after installer opens.",
      "pause"
    ].join("\r\n");
    writeFileSync(scriptPath, script);
    this.writeWindowsShortcutCopy(scriptPath);
    return scriptPath;
  }

  private writeWindowsShortcutCopy(scriptPath: string): void {
    if (platform() !== "win32") return;
    const targets = [
      join(homedir(), "Desktop", basename(scriptPath)),
      join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", basename(scriptPath))
    ];
    for (const target of targets) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(scriptPath, target);
    }
  }
}

function powershellCommand(command: string): string {
  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function separator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

function readBaselineFile(path: string, label: string): Buffer {
  if (!existsSync(path)) throw new DomainError(`${label} file is missing`, 400);
  try {
    return readFileSync(path);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new DomainError(`${label} file could not be read${detail}`, 400);
  }
}

function resolveInstalledSqliteNativePath(): string {
  return require.resolve("better-sqlite3/build/Release/better_sqlite3.node");
}

async function defaultGithubFetch(url: string, init?: { headers?: Record<string, string> }): Promise<GithubFetchResponse> {
  if (typeof fetch !== "function") throw new DomainError("GitHub updates require fetch support in this runtime", 503);
  const response = await fetch(url, init);
  return response;
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

function githubReleaseVersion(release: GithubRelease, asset: GithubReleaseAsset): string | null {
  const assetMatch = asset.name.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)/);
  if (assetMatch?.[1]) return assetMatch[1];
  const tagMatch = release.tag_name.match(/(?:hub-)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)/i);
  return tagMatch?.[1] ?? null;
}

function summarizeReleaseNotes(notes: string): string {
  return notes.trim().replace(/\s+/g, " ").slice(0, 600);
}
