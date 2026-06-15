import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import type { HubDatabase } from "./database.js";

const BACKUP_EXTENSION = ".sqlite";
const METADATA_EXTENSION = ".json";
const RESTORE_MARKER = "restore-pending.json";
const RESET_MARKER = "reset-pending.json";
const AUTO_BACKUP_PREFIXES = ["pre-restore-", "pre-update-"] as const;
const MANUAL_BACKUP_KIND = "manual";
const AUTOMATIC_BACKUP_KIND = "automatic";

interface RestoreMarker {
  backupPath: string;
  requestedAt: string;
}

interface ResetMarker {
  includeBackups: boolean;
  requestedAt: string;
}

export interface BackupSummary {
  fileName: string;
  path: string;
  label: string;
  kind: "manual" | "automatic";
  sizeBytes: number;
  createdAt: string;
}

export interface PendingRestoreSummary {
  requestedAt: string;
  backup: BackupSummary;
}

export interface BackupPruneSummary {
  deleted: number;
  kept: number;
}

export class BackupService {
  constructor(
    private readonly database: HubDatabase,
    private readonly databasePath: string,
    private readonly backupDir: string
  ) {
    mkdirSync(this.backupDir, { recursive: true });
  }

  static applyPendingRestore(databasePath: string, backupDir: string): BackupSummary | null {
    if (databasePath === ":memory:") return null;

    const markerPath = join(backupDir, RESTORE_MARKER);
    if (!existsSync(markerPath)) return null;

    const marker = BackupService.readRestoreMarker(markerPath);
    if (!marker) return null;
    const backupPath = BackupService.resolvePendingRestoreBackup(markerPath, backupDir, marker, { validate: true });
    if (!backupPath) return null;

    mkdirSync(dirname(databasePath), { recursive: true });
    mkdirSync(backupDir, { recursive: true });
    const restoreCopyPath = join(backupDir, `restore-validated-${BackupService.timestamp()}${BACKUP_EXTENSION}`);
    try {
      copyFileSync(backupPath, restoreCopyPath);
      BackupService.validateBackupFile(restoreCopyPath);
    } catch {
      rmSync(restoreCopyPath, { force: true });
      BackupService.renameMarkerAside(markerPath);
      return null;
    }

    if (existsSync(databasePath)) {
      BackupService.createPreRestoreSafetyBackup(databasePath, backupDir);
    }
    for (const path of BackupService.sqliteRuntimeFiles(databasePath)) {
      rmSync(path, { force: true });
    }

    copyFileSync(restoreCopyPath, databasePath);
    rmSync(restoreCopyPath, { force: true });
    rmSync(markerPath, { force: true });
    return BackupService.toSummary(databasePath);
  }

  static applyPendingReset(databasePath: string, backupDir: string): { reset: true; includeBackups: boolean } | null {
    if (databasePath === ":memory:") return null;

    const markerPath = join(backupDir, RESET_MARKER);
    if (!existsSync(markerPath)) return null;

    let marker: ResetMarker;
    try {
      marker = JSON.parse(readFileSync(markerPath, "utf8")) as ResetMarker;
    } catch {
      renameSync(markerPath, `${markerPath}.invalid-${Date.now()}`);
      return null;
    }
    mkdirSync(dirname(databasePath), { recursive: true });
    mkdirSync(backupDir, { recursive: true });

    for (const path of BackupService.sqliteRuntimeFiles(databasePath)) {
      rmSync(path, { force: true });
    }

    if (marker.includeBackups && existsSync(backupDir)) {
      for (const file of readdirSync(backupDir)) {
        if (file.endsWith(BACKUP_EXTENSION)) rmSync(join(backupDir, file), { force: true });
      }
    }

    rmSync(markerPath, { force: true });
    rmSync(join(backupDir, RESTORE_MARKER), { force: true });
    return { reset: true, includeBackups: Boolean(marker.includeBackups) };
  }

  async createBackup(label = "manual", kind: BackupSummary["kind"] = MANUAL_BACKUP_KIND): Promise<BackupSummary> {
    if (this.databasePath === ":memory:") {
      throw new Error("Backups are not available for in-memory databases");
    }

    const displayLabel = label.trim() || "Manual backup";
    const safeLabel = BackupService.safeLabel(displayLabel);
    const target = join(this.backupDir, `${safeLabel}-${BackupService.timestamp()}${BACKUP_EXTENSION}`);
    const tempTarget = `${target}.tmp`;
    await this.database.db.backup(tempTarget);
    BackupService.validateBackupFile(tempTarget);
    renameSync(tempTarget, target);
    BackupService.writeMetadata(target, { label: displayLabel, kind });
    return BackupService.toSummary(target);
  }

  listBackups(): BackupSummary[] {
    if (!existsSync(this.backupDir)) return [];
    const dir = this.backupDir;
    return readdirSync(dir)
      .filter((file) => file.endsWith(BACKUP_EXTENSION))
      .map((file) => BackupService.toSummary(join(dir, file)))
      .filter((backup) => backup.kind === MANUAL_BACKUP_KIND)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  deleteBackup(fileName: string): { deleted: true; fileName: string } | { deleted: false; reason: "automatic_backup" } {
    const backupPath = this.resolveBackupPath(fileName, { validate: false });
    const summary = BackupService.toSummary(backupPath);
    if (summary.kind !== MANUAL_BACKUP_KIND) return { deleted: false, reason: "automatic_backup" };
    const pending = this.getPendingRestore();
    if (pending?.backup.fileName === summary.fileName) throw new Error("Backup is scheduled for restore. Cancel pending restore before deleting it.");
    rmSync(backupPath, { force: true });
    rmSync(BackupService.metadataPath(backupPath), { force: true });
    return { deleted: true, fileName: summary.fileName };
  }

  pruneAutomaticBackups(options: { maxAgeDays?: number; maxPerPrefix?: number; now?: Date } = {}): BackupPruneSummary {
    if (!existsSync(this.backupDir)) return { deleted: 0, kept: 0 };
    const maxAgeDays = options.maxAgeDays ?? 30;
    const maxPerPrefix = options.maxPerPrefix ?? 5;
    const cutoff = (options.now ?? new Date()).getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
    let deleted = 0;
    let kept = 0;

    for (const prefix of AUTO_BACKUP_PREFIXES) {
      const files = readdirSync(this.backupDir)
        .filter((file) => file.startsWith(prefix) && file.endsWith(BACKUP_EXTENSION))
        .map((file) => {
          const path = join(this.backupDir, file);
          return { file, path, kind: BackupService.toSummary(path).kind, createdAt: BackupService.backupFileTime(path) };
        })
        .filter((entry) => entry.kind === AUTOMATIC_BACKUP_KIND)
        .sort((a, b) => b.createdAt - a.createdAt);

      for (const [index, entry] of files.entries()) {
        if (entry.createdAt < cutoff || index >= maxPerPrefix) {
          rmSync(entry.path, { force: true });
          rmSync(BackupService.metadataPath(entry.path), { force: true });
          deleted += 1;
        } else {
          kept += 1;
        }
      }
    }

    return { deleted, kept };
  }

  scheduleRestore(fileName: string): { scheduled: true; restartRequired: true; backup: BackupSummary } {
    const backupPath = this.resolveBackupPath(fileName);
    if (this.getPendingRestore()) throw new Error("A restore is already scheduled. Cancel pending restore before scheduling another.");
    if (this.activeOrderCount() > 0) throw new Error("Close or settle running orders before restoring a backup");
    BackupService.validateBackupFile(backupPath);

    const marker: RestoreMarker = {
      backupPath,
      requestedAt: new Date().toISOString()
    };
    writeFileSync(join(this.backupDir, RESTORE_MARKER), JSON.stringify(marker, null, 2));
    return { scheduled: true, restartRequired: true, backup: BackupService.toSummary(backupPath) };
  }

  getPendingRestore(): PendingRestoreSummary | null {
    const markerPath = join(this.backupDir, RESTORE_MARKER);
    if (!existsSync(markerPath)) return null;
    const marker = BackupService.readRestoreMarker(markerPath);
    if (!marker) return null;
    const backupPath = BackupService.resolvePendingRestoreBackup(markerPath, this.backupDir, marker, { validate: false });
    if (!backupPath) return null;
    return { requestedAt: marker.requestedAt, backup: BackupService.toSummary(backupPath) };
  }

  cancelPendingRestore(): { canceled: boolean } {
    const markerPath = join(this.backupDir, RESTORE_MARKER);
    const canceled = existsSync(markerPath);
    rmSync(markerPath, { force: true });
    return { canceled };
  }

  scheduleFullReset(includeBackups: boolean): { scheduled: true; restartRequired: true; includeBackups: boolean } {
    if (this.databasePath === ":memory:") {
      throw new Error("Full reset is not available for in-memory databases");
    }

    mkdirSync(this.backupDir, { recursive: true });
    const marker: ResetMarker = {
      includeBackups,
      requestedAt: new Date().toISOString()
    };
    writeFileSync(join(this.backupDir, RESET_MARKER), JSON.stringify(marker, null, 2));
    return { scheduled: true, restartRequired: true, includeBackups };
  }

  private static sqliteRuntimeFiles(databasePath: string): string[] {
    return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`];
  }

  private static validateBackupFile(path: string): void {
    if (!existsSync(path)) throw new Error("Backup file not found");
    const probe = new Database(path, { readonly: true, fileMustExist: true });
    try {
      const result = probe.pragma("integrity_check", { simple: true });
      if (result !== "ok") throw new Error("Backup failed SQLite integrity check");
    } finally {
      probe.close();
    }
  }

  private static toSummary(path: string): BackupSummary {
    const stats = statSync(path);
    const fileName = basename(path);
    const metadata = BackupService.readMetadata(path);
    return {
      fileName,
      path,
      label: metadata?.label ?? BackupService.fallbackLabel(fileName),
      kind: metadata?.kind ?? BackupService.inferBackupKind(fileName),
      sizeBytes: stats.size,
      createdAt: stats.birthtime.toISOString()
    };
  }

  private resolveBackupPath(fileName: string, options: { validate?: boolean } = { validate: true }): string {
    const backupPath = BackupService.resolvePathInside(this.backupDir, fileName);
    if (!fileName.endsWith(BACKUP_EXTENSION)) throw new Error("Backup file must be a SQLite backup");
    if (!existsSync(backupPath)) throw new Error("Backup file not found");
    if (options.validate !== false) BackupService.validateBackupFile(backupPath);
    return backupPath;
  }

  private static resolvePathInside(root: string, path: string): string {
    const resolvedPath = resolve(root, path);
    const resolvedRoot = resolve(root);
    const relativePath = relative(resolvedRoot, resolvedPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Backup path must stay inside the backup directory");
    }
    return resolvedPath;
  }

  private static readRestoreMarker(markerPath: string): RestoreMarker | null {
    try {
      const raw = JSON.parse(readFileSync(markerPath, "utf8")) as Partial<RestoreMarker>;
      if (!raw || typeof raw.backupPath !== "string" || raw.backupPath.trim().length === 0) {
        throw new Error("Restore marker is missing backupPath");
      }
      if (typeof raw.requestedAt !== "string" || raw.requestedAt.trim().length === 0) {
        throw new Error("Restore marker is missing requestedAt");
      }
      return { backupPath: raw.backupPath, requestedAt: raw.requestedAt };
    } catch {
      BackupService.renameMarkerAside(markerPath);
      return null;
    }
  }

  private static resolvePendingRestoreBackup(markerPath: string, backupDir: string, marker: RestoreMarker, options: { validate: boolean }): string | null {
    try {
      const backupPath = BackupService.resolvePathInside(backupDir, marker.backupPath);
      if (options.validate) BackupService.validateBackupFile(backupPath);
      else if (!existsSync(backupPath)) throw new Error("Backup file not found");
      return backupPath;
    } catch {
      BackupService.renameMarkerAside(markerPath);
      return null;
    }
  }

  private static renameMarkerAside(markerPath: string): void {
    if (!existsSync(markerPath)) return;
    renameSync(markerPath, `${markerPath}.invalid-${Date.now()}`);
  }

  private activeOrderCount(): number {
    const row = this.database.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('open', 'billed')").get() as { count: number };
    return row.count;
  }

  private static createPreRestoreSafetyBackup(databasePath: string, backupDir: string): void {
    const safetyPath = join(backupDir, `pre-restore-${BackupService.timestamp()}${BACKUP_EXTENSION}`);
    const tempSafetyPath = `${safetyPath}.tmp`;
    rmSync(tempSafetyPath, { force: true });
    const currentDb = new Database(databasePath, { fileMustExist: true });
    try {
      currentDb.pragma("wal_checkpoint(FULL)");
      currentDb.prepare("VACUUM INTO ?").run(tempSafetyPath);
    } finally {
      currentDb.close();
    }
    BackupService.validateBackupFile(tempSafetyPath);
    renameSync(tempSafetyPath, safetyPath);
    BackupService.writeMetadata(safetyPath, { label: `Pre-restore ${new Date().toISOString()}`, kind: AUTOMATIC_BACKUP_KIND });
  }

  private static metadataPath(path: string): string {
    return `${path}${METADATA_EXTENSION}`;
  }

  private static readMetadata(path: string): { label: string; kind: BackupSummary["kind"] } | null {
    const metadataPath = BackupService.metadataPath(path);
    if (!existsSync(metadataPath)) return null;
    try {
      const raw = JSON.parse(readFileSync(metadataPath, "utf8")) as { label?: unknown; kind?: unknown };
      const kind = raw.kind === AUTOMATIC_BACKUP_KIND ? AUTOMATIC_BACKUP_KIND : MANUAL_BACKUP_KIND;
      return { label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : BackupService.fallbackLabel(basename(path)), kind };
    } catch {
      return null;
    }
  }

  private static writeMetadata(path: string, metadata: { label: string; kind: BackupSummary["kind"] }): void {
    writeFileSync(BackupService.metadataPath(path), JSON.stringify({ ...metadata, fileName: basename(path), createdAt: new Date().toISOString() }, null, 2));
  }

  private static inferBackupKind(fileName: string): BackupSummary["kind"] {
    return AUTO_BACKUP_PREFIXES.some((prefix) => fileName.startsWith(prefix)) ? AUTOMATIC_BACKUP_KIND : MANUAL_BACKUP_KIND;
  }

  private static fallbackLabel(fileName: string): string {
    return fileName.replace(BACKUP_EXTENSION, "").replace(/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, "").replace(/-/g, " ");
  }

  private static safeLabel(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "manual";
  }

  private static backupFileTime(path: string): number {
    const timestamp = basename(path).match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.sqlite$/)?.[1];
    if (timestamp) {
      const [, date, hour, minute, second, millisecond] =
        timestamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/) ?? [];
      if (date && hour && minute && second && millisecond) {
        const parsed = Date.parse(`${date}T${hour}:${minute}:${second}.${millisecond}Z`);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return statSync(path).mtime.getTime();
  }

  private static timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
}
