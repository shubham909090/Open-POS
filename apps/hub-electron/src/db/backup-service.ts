import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import type { HubDatabase } from "./database.js";

const BACKUP_EXTENSION = ".sqlite";
const RESTORE_MARKER = "restore-pending.json";

interface RestoreMarker {
  backupPath: string;
  requestedAt: string;
}

export interface BackupSummary {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
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

    copyFileSync(marker.backupPath, databasePath);
    rmSync(markerPath, { force: true });
    return BackupService.toSummary(databasePath);
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

  private static timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
}
