import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
