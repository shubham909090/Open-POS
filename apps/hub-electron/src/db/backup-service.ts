import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import type { HubDatabase } from "./database.js";

const BACKUP_EXTENSION = ".sqlite";
const RESTORE_MARKER = "restore-pending.json";
const RESET_MARKER = "reset-pending.json";
const AUTO_BACKUP_PREFIXES = ["pre-restore-", "pre-update-"] as const;

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
  sizeBytes: number;
  createdAt: string;
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

    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as RestoreMarker;
    BackupService.validateBackupFile(marker.backupPath);

    mkdirSync(dirname(databasePath), { recursive: true });
    mkdirSync(backupDir, { recursive: true });

    if (existsSync(databasePath)) {
      const safetyPath = join(backupDir, `pre-restore-${BackupService.timestamp()}${BACKUP_EXTENSION}`);
      renameSync(databasePath, safetyPath);
    }
    for (const path of BackupService.sqliteRuntimeFiles(databasePath).filter((path) => path !== databasePath)) {
      rmSync(path, { force: true });
    }

    copyFileSync(marker.backupPath, databasePath);
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

  async createBackup(label = "manual"): Promise<BackupSummary> {
    if (this.databasePath === ":memory:") {
      throw new Error("Backups are not available for in-memory databases");
    }

    const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "manual";
    const target = join(this.backupDir, `${safeLabel}-${BackupService.timestamp()}${BACKUP_EXTENSION}`);
    await this.database.db.backup(target);
    return BackupService.toSummary(target);
  }

  listBackups(): BackupSummary[] {
    if (!existsSync(this.backupDir)) return [];
    const dir = this.backupDir;
    return readdirSync(dir)
      .filter((file) => file.endsWith(BACKUP_EXTENSION))
      .map((file) => BackupService.toSummary(join(dir, file)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
        .map((file) => ({ file, createdAt: BackupService.backupFileTime(join(this.backupDir, file)) }))
        .sort((a, b) => b.createdAt - a.createdAt);

      for (const [index, entry] of files.entries()) {
        if (entry.createdAt < cutoff || index >= maxPerPrefix) {
          rmSync(join(this.backupDir, entry.file), { force: true });
          deleted += 1;
        } else {
          kept += 1;
        }
      }
    }

    return { deleted, kept };
  }

  scheduleRestore(fileName: string): { scheduled: true; restartRequired: true; backup: BackupSummary } {
    const backupPath = resolve(this.backupDir, fileName);
    const backupRoot = resolve(this.backupDir);
    const backupRelativePath = relative(backupRoot, backupPath);
    if (backupRelativePath.startsWith("..") || isAbsolute(backupRelativePath)) {
      throw new Error("Backup path must stay inside the backup directory");
    }
    BackupService.validateBackupFile(backupPath);

    const marker: RestoreMarker = {
      backupPath,
      requestedAt: new Date().toISOString()
    };
    writeFileSync(join(this.backupDir, RESTORE_MARKER), JSON.stringify(marker, null, 2));
    return { scheduled: true, restartRequired: true, backup: BackupService.toSummary(backupPath) };
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
    return {
      fileName: basename(path),
      path,
      sizeBytes: stats.size,
      createdAt: stats.birthtime.toISOString()
    };
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
