import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

  it("applies a pending full reset and keeps backups by default", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-reset-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("before-reset");
    service.scheduleFullReset(false);
    database.close();
    writeFileSync(`${databasePath}-wal`, "");
    writeFileSync(`${databasePath}-shm`, "");
    writeFileSync(`${databasePath}-journal`, "");

    const reset = BackupService.applyPendingReset(databasePath, backupDir);

    expect(reset).toEqual({ reset: true, includeBackups: false });
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
    expect(existsSync(`${databasePath}-journal`)).toBe(false);
    expect(existsSync(backup.path)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("can include backups in a pending full reset", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-reset-backups-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("before-reset");
    service.scheduleFullReset(true);
    database.close();

    const reset = BackupService.applyPendingReset(databasePath, backupDir);

    expect(reset).toEqual({ reset: true, includeBackups: true });
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(backup.path)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not block startup when a pending reset marker is corrupted", () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-reset-corrupt-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    database.close();
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, "reset-pending.json"), "{not valid json");

    const reset = BackupService.applyPendingReset(databasePath, backupDir);

    expect(reset).toBeNull();
    expect(existsSync(databasePath)).toBe(true);
    expect(existsSync(join(backupDir, "reset-pending.json"))).toBe(false);
    expect(existsSync(join(backupDir, "reset-pending.json.invalid"))).toBe(false);
    expect(readdirContainsPrefix(backupDir, "reset-pending.json.invalid-")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("prunes only automatic safety backups", () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-backup-prune-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    const service = new BackupService(database, databasePath, backupDir);
    const files = [
      "pre-update-0-1-to-0-2-2026-04-01T00-00-00-000Z.sqlite",
      "pre-update-0-1-to-0-2-2026-05-20T00-00-00-000Z.sqlite",
      "pre-update-0-1-to-0-2-2026-05-21T00-00-00-000Z.sqlite",
      "pre-restore-2026-04-01T00-00-00-000Z.sqlite",
      "manual-2026-04-01T00-00-00-000Z.sqlite"
    ];
    for (const file of files) writeFileSync(join(backupDir, file), "");

    const result = service.pruneAutomaticBackups({ maxAgeDays: 30, maxPerPrefix: 1, now: new Date("2026-05-24T12:00:00.000Z") });

    expect(result).toEqual({ deleted: 3, kept: 1 });
    expect(readdirSync(backupDir).sort()).toEqual([
      "manual-2026-04-01T00-00-00-000Z.sqlite",
      "pre-update-0-1-to-0-2-2026-05-21T00-00-00-000Z.sqlite"
    ]);
    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});

function readdirContainsPrefix(dir: string, prefix: string) {
  return existsSync(dir) && readdirSync(dir).some((file) => file.startsWith(prefix));
}
