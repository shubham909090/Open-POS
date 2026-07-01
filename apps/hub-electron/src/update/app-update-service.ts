import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { platform } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { readAppMetadata } from "../app-metadata.js";
import type { BackupService, BackupSummary } from "../db/backup-service.js";
import type { HubDatabase } from "../db/database.js";
import { DomainError } from "../domain/errors.js";
import type { OnlineUpdateMetadata, UpdatePackageManifest } from "./update-package.js";
import { PACKAGED_SQLITE_NATIVE_PATH, UPDATE_APP_ID, sha256, validateOnlineUpdateMetadata, validateUpdatePackage, validateWindowsX64NativeModule } from "./update-package.js";
import { GithubUpdateSource, compareVersions, type GithubFetch, type GithubUpdateCheckResult, type GithubUpdateInstallRequest } from "./github-update-source.js";
import { powershellCommand, psQuote, startProcessCommand, writeWindowsHandoffScript, type UpdateLaunchPlan } from "./windows-update-handoff.js";
export type { GithubFetch, GithubFetchResponse, GithubRelease, GithubReleaseAsset, GithubUpdateCheckResult, GithubUpdateCheckStatus, GithubUpdateInstallRequest } from "./github-update-source.js";
export type { UpdateLaunchPlan } from "./windows-update-handoff.js";

const STATE_FILE = "app-update-state.json";
const require = createRequire(import.meta.url);

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
  online: OnlineUpdateState;
  baselineRegistered: boolean;
  rollbackAvailable: boolean;
  current?: CachedUpdatePackage;
  pending?: CachedUpdatePackage;
  previous?: RollbackPackage;
  recoveryScriptPath?: string;
}

export interface ValidatedPackageResult {
  ok: true;
  packagePath: string;
  packageFileName: string;
  manifest: UpdatePackageManifest;
}

export type OnlineUpdateStateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "up_to_date"
  | "error";

export interface OnlineUpdateState {
  enabled: boolean;
  status: OnlineUpdateStateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadPercent: number | null;
  message: string | null;
  checkedAt: string | null;
  lastBackupFileName?: string;
}

export interface OnlineUpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
}

export interface OnlineAppUpdater {
  checkForUpdates(): Promise<OnlineUpdateCheckResult>;
  readUpdateMetadata(version: string): Promise<OnlineUpdateMetadata>;
  downloadUpdate(): Promise<UpdateLaunchPlan>;
  onDownloadProgress?(handler: (percent: number) => void): void;
}

export type OnlineUpdateInstallResult =
  | { status: "up_to_date"; currentVersion: string }
  | { installing: true; backup: BackupSummary; version: string; recoveryScriptPath?: string };

export class AppUpdateService {
  private onlineState: OnlineUpdateState;
  private onlineUpdateRunning = false;

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
      onlineUpdater?: OnlineAppUpdater;
      launchInstaller?: (plan: UpdateLaunchPlan) => Promise<void> | void;
      exitApp?: () => void;
      platform?: NodeJS.Platform;
    }
  ) {
    this.onlineState = createOnlineState(this.input.appVersion, Boolean(this.input.onlineUpdater));
    this.input.onlineUpdater?.onDownloadProgress?.((percent) => {
      this.setOnlineState({
        status: "downloading",
        downloadPercent: Math.max(0, Math.min(100, Math.round(percent))),
        message: null
      });
    });
    mkdirSync(this.input.updateDir, { recursive: true });
    this.completePendingInstall();
  }

  status(): AppUpdateStatus {
    const state = this.readState();
    return {
      appVersion: this.input.appVersion,
      dbSchemaVersion: this.input.dbSchemaVersion,
      activeOrderCount: this.activeOrderCount(),
      online: this.onlineState,
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
    const backup = await this.input.backupService.createBackup(`pre-update-${this.input.appVersion}-to-${validated.manifest.version}`, "automatic");
    const pending = this.cachePackage(validated);
    const previous: RollbackPackage = {
      ...state.current,
      preUpdateBackupFileName: backup.fileName,
      preUpdateBackupPath: backup.path,
      preparedAt: new Date().toISOString()
    };
    const recoveryScriptPath = this.writeRecoveryScript(previous);
    this.writeState({ ...state, pending, previous, recoveryScriptPath });
    await this.launchAndExit({ filePath: pending.installerPath, args: [] });
    return { installing: true, backup, package: pending, recoveryScriptPath };
  }

  async rollback(): Promise<{ rollingBack: true; package: RollbackPackage }> {
    const state = this.readState();
    if (!state.previous) throw new DomainError("No rollback package is available", 400);
    if (!existsSync(state.previous.installerPath)) throw new DomainError("Previous installer is missing", 400);
    if (!existsSync(state.previous.preUpdateBackupPath)) throw new DomainError("Pre-update database backup is missing", 400);
    const recoveryScriptPath = this.writeRecoveryScript(state.previous);
    this.writeState({ ...state, recoveryScriptPath });
    await this.launchAndExit({ filePath: recoveryScriptPath, args: [] });
    return { rollingBack: true, package: state.previous };
  }

  async checkGithubLatest(): Promise<GithubUpdateCheckResult> {
    return this.githubUpdateSource().checkLatest();
  }

  async installGithubUpdate(request?: GithubUpdateInstallRequest): Promise<{ installing: true; backup: BackupSummary; package: CachedUpdatePackage; recoveryScriptPath: string }> {
    const state = this.readState();
    if (state.current?.version !== this.input.appVersion) {
      throw new DomainError("Register the current app package before installing updates", 400);
    }
    const activeOrderCount = this.activeOrderCount();
    if (activeOrderCount > 0) throw new DomainError(`Close or settle ${activeOrderCount} running order(s) before installing update`, 400);
    const source = this.githubUpdateSource();
    const candidate = request
      ? await source.downloadPinnedPackage(request)
      : await source.downloadLatestPackage();
    if (!candidate) throw new DomainError("No stable GitHub release contains a Gaurav POS update package", 404);
    if (request && candidate.validated.manifest.version !== request.expectedVersion) {
      throw new DomainError(`GitHub update package version ${candidate.validated.manifest.version} does not match selected version ${request.expectedVersion}`, 400);
    }
    if (compareVersions(candidate.validated.manifest.version, this.input.appVersion) <= 0) {
      throw new DomainError(`Gaurav POS Hub is already up to date (${this.input.appVersion})`, 400);
    }
    return this.installUpdate(candidate.validated.packagePath);
  }

  async installOnlineUpdate(): Promise<OnlineUpdateInstallResult> {
    const onlineUpdater = this.input.onlineUpdater;
    if (!onlineUpdater) throw new DomainError("Online app updates are not available in this build", 503);
    if (this.onlineUpdateRunning) throw new DomainError("App update already in progress", 409);

    const activeOrderCount = this.activeOrderCount();
    if (activeOrderCount > 0) throw new DomainError(`Close or settle ${activeOrderCount} running order(s) before installing update`, 400);

    this.onlineUpdateRunning = true;
    try {
      const checkedAt = new Date().toISOString();
      this.setOnlineState({ status: "checking", checkedAt, message: null, downloadPercent: null, availableVersion: null });
      const check = await onlineUpdater.checkForUpdates();
      if (!check.updateAvailable) {
        this.setOnlineState({ status: "up_to_date", checkedAt, message: null, availableVersion: null, downloadPercent: null });
        return { status: "up_to_date", currentVersion: this.input.appVersion };
      }

      if (!check.version) throw new DomainError("Online update metadata is unavailable because the updater did not report a version", 400);
      const version = check.version;
      this.setOnlineState({ status: "available", checkedAt, availableVersion: version, message: null });
      let metadata: OnlineUpdateMetadata;
      try {
        metadata = validateOnlineUpdateMetadata(await onlineUpdater.readUpdateMetadata(version), this.input.dbSchemaVersion, version);
      } catch (error) {
        throw new DomainError(error instanceof Error ? error.message : "Online update metadata is invalid", 400);
      }
      const state = this.readState();
      this.setOnlineState({ status: "downloading", downloadPercent: 0, message: null });
      const installPlan = await onlineUpdater.downloadUpdate();
      if (!installPlan.filePath) throw new DomainError("Online update installer path is unavailable after download", 400);
      this.setOnlineState({ status: "downloaded", downloadPercent: 100, message: null });

      const finalActiveOrderCount = this.activeOrderCount();
      if (finalActiveOrderCount > 0) throw new DomainError(`Close or settle ${finalActiveOrderCount} running order(s) before installing update`, 400);
      this.input.database.integrityCheck();
      const backup = await this.input.backupService.createBackup(`pre-update-${this.input.appVersion}-to-${version}`, "automatic");
      const pending = this.cacheOnlineInstaller(metadata, installPlan.filePath, state.current);
      let previous: RollbackPackage | undefined;
      let recoveryScriptPath: string | undefined;
      if (state.current?.version === this.input.appVersion) {
        previous = {
          ...state.current,
          preUpdateBackupFileName: backup.fileName,
          preUpdateBackupPath: backup.path,
          preparedAt: new Date().toISOString()
        };
        recoveryScriptPath = this.writeRecoveryScript(previous);
      }
      this.writeState({ ...state, pending, ...(previous ? { previous, recoveryScriptPath } : {}) });
      this.setOnlineState({ status: "installing", lastBackupFileName: backup.fileName, message: null });
      await this.launchAndExit({ filePath: pending.installerPath, args: installPlan.args });
      this.onlineUpdateRunning = true;
      return { installing: true, backup, version, ...(recoveryScriptPath ? { recoveryScriptPath } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Online update failed";
      this.setOnlineState({ status: "error", message });
      if (error instanceof DomainError) throw error;
      throw new DomainError(message, 400);
    } finally {
      if (this.onlineState.status !== "installing") this.onlineUpdateRunning = false;
    }
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

  private cacheOnlineInstaller(metadata: OnlineUpdateMetadata, sourceInstallerPath: string, current?: CachedUpdatePackage): CachedUpdatePackage {
    const installerBytes = readBaselineFile(sourceInstallerPath, "Online update installer");
    const installerFileName = basename(sourceInstallerPath);
    if (installerFileName !== basename(installerFileName) || !installerFileName.toLowerCase().endsWith(".exe")) {
      throw new DomainError("Online update installer path is invalid", 400);
    }
    const manifest: UpdatePackageManifest = {
      schemaVersion: 1,
      appId: UPDATE_APP_ID,
      productName: metadata.productName,
      version: metadata.version,
      platform: metadata.platform,
      arch: metadata.arch,
      electronVersion: current?.manifest.electronVersion ?? readAppMetadata().electronVersion,
      dbSchemaVersion: metadata.dbSchemaVersion,
      minSourceDbSchemaVersion: metadata.minSourceDbSchemaVersion,
      createdAt: metadata.createdAt,
      installer: {
        fileName: installerFileName,
        sha256: sha256(installerBytes),
        sizeBytes: installerBytes.length
      },
      sqliteNative: current?.manifest.sqliteNative ?? this.installedSqliteNativeManifest()
    };
    const cacheRoot = this.safeCacheRoot(metadata.version);
    mkdirSync(cacheRoot, { recursive: true });
    const installerPath = join(cacheRoot, installerFileName);
    copyFileSync(sourceInstallerPath, installerPath);
    return {
      version: metadata.version,
      packagePath: installerPath,
      installerPath,
      manifest,
      cachedAt: new Date().toISOString()
    };
  }

  private installedSqliteNativeManifest(): UpdatePackageManifest["sqliteNative"] {
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
    return {
      fileName: PACKAGED_SQLITE_NATIVE_PATH,
      sha256: sha256(sqliteNativeBytes),
      sizeBytes: sqliteNativeBytes.length,
      format: "pe32plus-x64"
    };
  }

  private validatePackageForCurrentDb(packagePath: string): ReturnType<typeof validateUpdatePackage> {
    try {
      return validateUpdatePackage(packagePath, this.input.dbSchemaVersion);
    } catch (error) {
      throw new DomainError(error instanceof Error ? error.message : "Update package is invalid", 400);
    }
  }

  private githubUpdateSource(): GithubUpdateSource<ReturnType<typeof validateUpdatePackage>> {
    return new GithubUpdateSource({
      updateDir: this.input.updateDir,
      appVersion: this.input.appVersion,
      githubFetch: this.input.githubFetch,
      validatePackage: (packagePath) => this.validatePackageForCurrentDb(packagePath)
    });
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

  private async launchAndExit(plan: UpdateLaunchPlan): Promise<void> {
    const launchPlan = this.installerLaunchPlan(plan);
    if (this.input.launchInstaller) await this.input.launchInstaller(launchPlan);
    else {
      const child = spawn(launchPlan.filePath, launchPlan.args, { detached: true, stdio: "ignore", shell: extname(launchPlan.filePath).toLowerCase() === ".cmd" });
      child.unref();
    }
    if (this.input.exitApp) this.input.exitApp();
  }

  private installerLaunchPlan(plan: UpdateLaunchPlan): UpdateLaunchPlan {
    const targetPlatform = this.input.platform ?? platform();
    if (targetPlatform !== "win32" || extname(plan.filePath).toLowerCase() !== ".exe") return plan;
    return { filePath: this.writeInstallerHandoffScript(plan), args: [] };
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

  private setOnlineState(patch: Partial<OnlineUpdateState>): void {
    this.onlineState = { ...this.onlineState, ...patch };
  }

  private statePath(): string {
    return join(this.input.updateDir, STATE_FILE);
  }

  private writeRecoveryScript(previous: RollbackPackage): string {
    const scriptPath = join(this.input.updateDir, "Rollback Gaurav POS Update.cmd");
    const databasePath = this.input.databasePath;
    const backupPath = previous.preUpdateBackupPath;
    return writeWindowsHandoffScript({
      scriptPath,
      waitMessage: "Waiting for Gaurav POS Hub to close before restoring the database...",
      afterWaitMilliseconds: 300,
      afterWaitLines: [
        "echo Restoring Gaurav POS pre-update database backup...",
        powershellCommand(`Remove-Item -Force -ErrorAction SilentlyContinue ${psQuote(`${databasePath}-wal`)},${psQuote(`${databasePath}-shm`)},${psQuote(`${databasePath}-journal`)}`),
        powershellCommand(`Copy-Item -Force ${psQuote(backupPath)} ${psQuote(databasePath)}`),
        "echo Launching previous Gaurav POS installer...",
        powershellCommand(startProcessCommand({ filePath: previous.installerPath, args: [] }))
      ],
      pauseMessage: "Rollback started. You can close this window after installer opens.",
      copyShortcut: true
    });
  }

  private writeInstallerHandoffScript(plan: UpdateLaunchPlan): string {
    return writeWindowsHandoffScript({
      scriptPath: join(this.input.updateDir, "Install Gaurav POS Update.cmd"),
      waitMessage: "Waiting for Gaurav POS Hub to close before installing the update...",
      afterWaitMilliseconds: 500,
      afterWaitLines: [powershellCommand(startProcessCommand(plan))]
    });
  }
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

function createOnlineState(appVersion: string, enabled: boolean): OnlineUpdateState {
  return {
    enabled,
    status: enabled ? "idle" : "disabled",
    currentVersion: appVersion,
    availableVersion: null,
    downloadPercent: null,
    message: enabled ? null : "Online app updates are not available in this build",
    checkedAt: null
  };
}
