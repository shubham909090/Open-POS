import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { BackupService } from "../db/backup-service.js";
import { HubDatabase } from "../db/database.js";

describe("BackupService", () => {
  it("creates named manual backups, hides automatic safety backups, and deletes manual backups only", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-manual-backup-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();

    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("Before Menu Price Update");
    writeFileSync(join(backupDir, "pre-update-2026-05-20T00-00-00-000Z.sqlite"), "");

    expect(backup).toMatchObject({
      label: "Before Menu Price Update",
      kind: "manual"
    });
    expect(backup.fileName).toMatch(/^before-menu-price-update-.*\.sqlite$/);
    expect(service.listBackups()).toEqual([expect.objectContaining({ fileName: backup.fileName, label: "Before Menu Price Update", kind: "manual" })]);
    expect(service.deleteBackup("pre-update-2026-05-20T00-00-00-000Z.sqlite")).toEqual({ deleted: false, reason: "automatic_backup" });
    expect(service.deleteBackup(backup.fileName)).toEqual({ deleted: true, fileName: backup.fileName });
    expect(existsSync(backup.path)).toBe(false);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("deletes corrupt manual backups after ownership checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-corrupt-manual-delete-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();

    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("Manual backup to remove");
    writeFileSync(backup.path, "not a sqlite database");

    expect(service.deleteBackup(backup.fileName)).toEqual({ deleted: true, fileName: backup.fileName });
    expect(existsSync(backup.path)).toBe(false);
    expect(existsSync(`${backup.path}.json`)).toBe(false);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

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
    database.db
      .prepare("INSERT INTO hub_settings (key, value, updated_at) VALUES ('restore_probe', 'before', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(new Date().toISOString());
    const service = new BackupService(database, databasePath, backupDir);
    const backup = await service.createBackup("restore");
    service.scheduleRestore(backup.fileName);
    database.db.prepare("UPDATE hub_settings SET value = 'after' WHERE key = 'restore_probe'").run();
    database.close();

    const restored = BackupService.applyPendingRestore(databasePath, backupDir);
    const restoredDatabase = new HubDatabase(databasePath);
    const restoredSetting = restoredDatabase.db.prepare("SELECT value FROM hub_settings WHERE key = 'restore_probe'").get() as { value: string };

    expect(restored?.fileName).toBe("hub.sqlite");
    expect(restoredSetting.value).toBe("before");
    expect(readdirContainsPrefix(backupDir, "pre-restore-")).toBe(true);
    restoredDatabase.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects scheduling a second restore while one is pending", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-restore-pending-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    const service = new BackupService(database, databasePath, backupDir);
    const first = await service.createBackup("first");
    const second = await service.createBackup("second");

    service.scheduleRestore(first.fileName);

    expect(() => service.scheduleRestore(second.fileName)).toThrow("A restore is already scheduled");

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("does not block startup when a pending restore marker is corrupted", () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-restore-corrupt-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    database.close();
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, "restore-pending.json"), "{not valid json");

    const restored = BackupService.applyPendingRestore(databasePath, backupDir);

    expect(restored).toBeNull();
    expect(existsSync(databasePath)).toBe(true);
    expect(existsSync(join(backupDir, "restore-pending.json"))).toBe(false);
    expect(readdirContainsPrefix(backupDir, "restore-pending.json.invalid-")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not block startup when a pending restore marker has an invalid target", () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-restore-invalid-target-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    database.close();
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, "restore-pending.json"), JSON.stringify({ backupPath: join(backupDir, "missing.sqlite"), requestedAt: new Date().toISOString() }));

    const restored = BackupService.applyPendingRestore(databasePath, backupDir);

    expect(restored).toBeNull();
    expect(existsSync(databasePath)).toBe(true);
    expect(existsSync(join(backupDir, "restore-pending.json"))).toBe(false);
    expect(readdirContainsPrefix(backupDir, "restore-pending.json.invalid-")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not block startup when a pending restore backup is corrupt", () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-restore-corrupt-target-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    database.close();
    mkdirSync(backupDir, { recursive: true });
    const corruptBackupPath = join(backupDir, "manual-corrupt-2026-05-20T00-00-00-000Z.sqlite");
    writeFileSync(corruptBackupPath, "not sqlite");
    writeFileSync(join(backupDir, "restore-pending.json"), JSON.stringify({ backupPath: corruptBackupPath, requestedAt: new Date().toISOString() }));

    const restored = BackupService.applyPendingRestore(databasePath, backupDir);

    expect(restored).toBeNull();
    expect(existsSync(databasePath)).toBe(true);
    expect(existsSync(join(backupDir, "restore-pending.json"))).toBe(false);
    expect(readdirContainsPrefix(backupDir, "restore-pending.json.invalid-")).toBe(true);
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

  it("does not prune manual backups whose labels look like automatic safety backups", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-backup-prune-manual-prefix-"));
    const databasePath = join(root, "hub.sqlite");
    const backupDir = join(root, "backups");
    const database = new HubDatabase(databasePath);
    database.migrate();
    const service = new BackupService(database, databasePath, backupDir);
    const manual = await service.createBackup("pre-update festival menu");
    const automatic = await service.createBackup("pre-update 0.1.0 to 0.1.1", "automatic");

    const result = service.pruneAutomaticBackups({ maxAgeDays: 9999, maxPerPrefix: 0, now: new Date("2026-05-24T12:00:00.000Z") });

    expect(result).toEqual({ deleted: 1, kept: 0 });
    expect(existsSync(manual.path)).toBe(true);
    expect(existsSync(`${manual.path}.json`)).toBe(true);
    expect(existsSync(automatic.path)).toBe(false);
    expect(existsSync(`${automatic.path}.json`)).toBe(false);
    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});

function readdirContainsPrefix(dir: string, prefix: string) {
  return existsSync(dir) && readdirSync(dir).some((file) => file.startsWith(prefix));
}
