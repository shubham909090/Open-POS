import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { BackupService } from "../db/backup-service.js";
import { HubDatabase } from "../db/database.js";

describe("BackupService", () => {
  it("creates backups and schedules restore markers", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-backup-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    database.seedDemoData();

    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("test");
    const backups = service.listBackups();
    const restore = service.scheduleRestore(backup.fileName);

    expect(backup.fileName).toContain("test-");
    expect(backups).toHaveLength(1);
    expect(restore.restartRequired).toBe(true);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("applies a pending restore before the database opens", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-restore-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("restore");
    service.scheduleRestore(backup.fileName);
    database.close();

    const restored = BackupService.applyPendingRestore(databasePath, backupDir);

    expect(restored?.fileName).toBe("hub.sqlite");
    rmSync(root, { recursive: true, force: true });
  });
});
