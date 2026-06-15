import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createHubServer, isRealtimeEventVisibleForRole, realtimeEventForRole, resolvePairingHubUrl, selectPairingLanAddress } from "../api/server.js";
import { BackupService } from "../db/backup-service.js";
import { cloudCommandFailures, idempotencyRecords } from "../db/drizzle-schema.js";
import { EventBus } from "../domain/event-bus.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";
import {
  createFailingPrintTestServer,
  createFileBackedTestServer,
  createTestServer,
  expectNoSocketMessage,
  insertApiDailySnapshot,
  listenForWebSockets,
  pairTestDevice,
  pairingPayload,
  setTestManagerPin,
  testManagerApproval,
  waitForSocketClose,
  waitForSocketMessage,
  waitForSocketOpen
} from "./api-server-helpers.js";

function enableCloudBackup(database: ReturnType<typeof createTestHub>["database"]) {
  database.db
    .prepare(
      `INSERT INTO hub_settings (key, value, updated_at)
       VALUES ('cloud_backup_enabled', '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(new Date().toISOString());
}

describe("Hub API auth, settings, and pairing routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses saved hub public URL in pairing QR payloads instead of localhost", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token", "x-manager-pin": "1234" };
    await setTestManagerPin(app);
    await app.inject({
      method: "PUT",
      url: "/settings/hub-connection",
      headers,
      payload: {
        cloudUrl: "https://example.convex.site",
        installationId: "install-main",
        syncSecret: "secret-main",
        hubPublicUrl: "http://192.168.1.20:3737"
      }
    });

    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: { "x-device-token": "test-admin-token", host: "127.0.0.1:3737" },
      payload: pairingPayload("Waiter phone", "waiter")
    });
    const pairing = pairingResponse.json<{ pairingPayload: { hubUrl: string }; pairingPayloadText: string }>();

    expect(pairing.pairingPayload.hubUrl).toBe("http://192.168.1.20:3737");
    expect(JSON.parse(pairing.pairingPayloadText).hubUrl).toBe("http://192.168.1.20:3737");

    await app.close();
    database.close();
  });

  it("falls back to detected LAN IPv4 when pairing requests arrive through localhost", () => {
    expect(
      resolvePairingHubUrl({
        savedPublicUrl: "",
        configuredPublicUrl: "",
        requestProtocol: "http",
        requestHost: "127.0.0.1:3737",
        fallbackLanAddress: "192.168.1.34"
      })
    ).toBe("http://192.168.1.34:3737");
  });

  it("prefers physical LAN interfaces over virtual adapters for QR fallback", () => {
    expect(
      selectPairingLanAddress({
        "vEthernet (Default Switch)": [{ address: "172.24.96.1", family: "IPv4", internal: false }],
        "Docker Desktop": [{ address: "192.168.65.1", family: "IPv4", internal: false }],
        "Wi-Fi": [{ address: "192.168.1.34", family: "IPv4", internal: false }]
      })
    ).toBe("192.168.1.34");
  });

  it("requires a local device token for protected routes", async () => {
    const { app, database } = createTestServer();

    const unauthorized = await app.inject({ method: "GET", url: "/sync/bootstrap" });
    const authorized = await app.inject({
      method: "GET",
      url: "/sync/bootstrap",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json<{ setup: { printerOutputMode: "test" | "live" } }>().setup.printerOutputMode).toBe("test");

    await app.close();
    database.close();
  });

  it("blocks service APIs server-side when the local license is locked", async () => {
    const hub = createTestHub();
    const app = createHubServer({
      database: hub.database,
      backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
      authService: hub.authService,
      orderService: hub.orderService,
      printJobService: new PrintJobService(hub.database.orm, new DryRunPrinterAdapter()),
      syncBridge: {
        getLicenseState: () => ({ status: "locked", reason: "expired", message: "License expired. Contact support to renew." })
      } as unknown as ConvexSyncBridge,
      eventBus: new EventBus<unknown>()
    });

    const blockedOrder = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: { "x-device-token": "test-admin-token" },
      payload: {}
    });
    const licenseStatus = await app.inject({
      method: "GET",
      url: "/license/status",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(blockedOrder.statusCode).toBe(402);
    expect(blockedOrder.json()).toEqual({ error: "License expired. Contact support to renew." });
    expect(licenseStatus.statusCode).toBe(200);

    await app.close();
    hub.database.close();
  });

  it("uses strict build license policy without relying on process env", async () => {
    const previousRequired = process.env.POS_LICENSE_REQUIRED;
    delete process.env.POS_LICENSE_REQUIRED;
    const hub = createTestHub();
    const app = createHubServer({
      database: hub.database,
      backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
      authService: hub.authService,
      orderService: hub.orderService,
      printJobService: new PrintJobService(hub.database.orm, new DryRunPrinterAdapter()),
      syncBridge: {
        getLicenseState: () => ({
          status: "missing",
          reason: "missing_license",
          message: "Activate this hub with a setup key before using cloud backup."
        })
      } as unknown as ConvexSyncBridge,
      eventBus: new EventBus<unknown>(),
      licenseRequired: true
    });

    try {
      const blockedOrder = await app.inject({
        method: "POST",
        url: "/orders/submit",
        headers: { "x-device-token": "test-admin-token" },
        payload: {}
      });

      expect(blockedOrder.statusCode).toBe(402);
      expect(blockedOrder.json()).toEqual({ error: "Activate this hub with a setup key before using cloud backup." });
    } finally {
      if (previousRequired === undefined) delete process.env.POS_LICENSE_REQUIRED;
      else process.env.POS_LICENSE_REQUIRED = previousRequired;
      await app.close();
      hub.database.close();
    }
  });

  it("dedupes overlapping cloud pull sync requests so repeated clicks do not stack work", async () => {
    const hub = createTestHub();
    enableCloudBackup(hub.database);
    let releasePull!: () => void;
    const pullCloudSnapshot = vi.fn(
      () =>
        new Promise<{ applied: number; failed: number; skipped: boolean }>((resolve) => {
          releasePull = () => resolve({ applied: 3, failed: 0, skipped: false });
        })
    );
    const app = createHubServer({
      database: hub.database,
      backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
      authService: hub.authService,
      orderService: hub.orderService,
      printJobService: new PrintJobService(hub.database.orm, new DryRunPrinterAdapter()),
      syncBridge: {
        pullCloudSnapshot,
        pushPending: vi.fn(),
        requeueFailedEvents: vi.fn()
      } as unknown as ConvexSyncBridge,
      eventBus: new EventBus<unknown>()
    });

    const first = app.inject({ method: "POST", url: "/sync/pull", headers: { "x-device-token": "test-admin-token" } });
    const second = app.inject({ method: "POST", url: "/sync/pull", headers: { "x-device-token": "test-admin-token" } });
    await vi.waitFor(() => expect(pullCloudSnapshot).toHaveBeenCalledTimes(1));
    releasePull();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.json()).toEqual({ applied: 3, failed: 0, skipped: false });
    expect(secondResponse.json()).toEqual({ applied: 3, failed: 0, skipped: false });
    expect(pullCloudSnapshot).toHaveBeenCalledTimes(1);

    await app.close();
    hub.database.close();
  });

  it("lets a fresh hub create a Manager PIN and unlock setup without hub.env admin token", async () => {
    const { app, database } = createTestServer();

    const statusBefore = await app.inject({ method: "GET", url: "/admin/session/status" });
    const remoteCreatePin = await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      remoteAddress: "192.168.1.44",
      payload: { newPin: "9999", updatedBy: "remote" }
    });
    const createPin = await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const unlock = await app.inject({
      method: "POST",
      url: "/admin/session/unlock",
      payload: { pin: "4321" }
    });
    const token = unlock.json<{ token: string }>().token;
    const bootstrap = await app.inject({
      method: "GET",
      url: "/sync/bootstrap",
      headers: { "x-device-token": token }
    });

    expect(statusBefore.json()).toEqual({ managerPinConfigured: false });
    expect(remoteCreatePin.statusCode).toBe(403);
    expect(remoteCreatePin.json()).toEqual({ error: "Create the first Manager PIN from the hub PC." });
    expect(createPin.statusCode).toBe(200);
    expect(unlock.statusCode).toBe(200);
    expect(token).toMatch(/^hub_admin_/);
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json<{ setup: { managerPinConfigured: boolean } }>().setup.managerPinConfigured).toBe(true);

    await app.close();
    database.close();
  });

  it("locks the local admin session by invalidating the issued token", async () => {
    const { app, database } = createTestServer();

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const unlock = await app.inject({
      method: "POST",
      url: "/admin/session/unlock",
      payload: { pin: "4321" }
    });
    const token = unlock.json<{ token: string }>().token;
    const beforeLock = await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": token } });
    const lock = await app.inject({ method: "POST", url: "/admin/session/lock", headers: { "x-device-token": token }, payload: {} });
    const afterLock = await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": token } });

    expect(beforeLock.statusCode).toBe(200);
    expect(lock.statusCode).toBe(200);
    expect(afterLock.statusCode).toBe(401);

    await app.close();
    database.close();
  });

  it("keeps separate PIN-unlocked admin sessions active across devices", async () => {
    const { app, database } = createTestServer();

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const upstairsUnlock = await app.inject({
      method: "POST",
      url: "/admin/session/unlock",
      payload: { pin: "4321" }
    });
    const downstairsUnlock = await app.inject({
      method: "POST",
      url: "/admin/session/unlock",
      payload: { pin: "4321" }
    });
    const upstairsToken = upstairsUnlock.json<{ token: string }>().token;
    const downstairsToken = downstairsUnlock.json<{ token: string }>().token;

    expect(upstairsToken).not.toBe(downstairsToken);
    expect(await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": upstairsToken } })).toMatchObject({ statusCode: 200 });
    expect(await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": downstairsToken } })).toMatchObject({ statusCode: 200 });

    await app.inject({ method: "POST", url: "/admin/session/lock", headers: { "x-device-token": downstairsToken }, payload: {} });

    expect(await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": downstairsToken } })).toMatchObject({ statusCode: 401 });
    expect(await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": upstairsToken } })).toMatchObject({ statusCode: 200 });

    await app.close();
    database.close();
  });

  it("requires Manager PIN for bulk dish delete and Master PIN for bulk alcohol delete", async () => {
    const { app, database } = createTestServer();
    await setTestManagerPin(app);
    await app.inject({
      method: "PUT",
      url: "/settings/master-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "9876", confirmPin: "9876", updatedBy: "owner" }
    });

    const dishWithoutPin = await app.inject({
      method: "POST",
      url: "/menu-items/bulk-delete",
      headers: { "x-device-token": "test-admin-token" },
      payload: {}
    });
    const dishWithPin = await app.inject({
      method: "POST",
      url: "/menu-items/bulk-delete",
      headers: { "x-device-token": "test-admin-token" },
      payload: { managerApproval: { pin: "1234", reason: "Bulk delete dishes", approvedBy: "manager" } }
    });
    const alcoholWithManagerPin = await app.inject({
      method: "POST",
      url: "/alcohol/items/bulk-delete",
      headers: { "x-device-token": "test-admin-token" },
      payload: { managerApproval: { pin: "1234", reason: "Wrong approval", approvedBy: "manager" } }
    });
    const alcoholWithMasterPin = await app.inject({
      method: "POST",
      url: "/alcohol/items/bulk-delete",
      headers: { "x-device-token": "test-admin-token" },
      payload: { masterApproval: { pin: "9876", reason: "Bulk delete alcohol", approvedBy: "owner" } }
    });

    expect(dishWithoutPin.statusCode).toBe(403);
    expect(dishWithPin.statusCode).toBe(200);
    expect(dishWithPin.json()).toMatchObject({ deleted: expect.any(Number), disabled: expect.any(Number), failed: 0, errors: [] });
    expect(alcoholWithManagerPin.statusCode).toBe(403);
    expect(alcoholWithMasterPin.statusCode).toBe(200);
    expect(alcoholWithMasterPin.json()).toMatchObject({ deleted: expect.any(Number), disabled: expect.any(Number), failed: 0, errors: [] });

    await app.close();
    database.close();
  });

  it("schedules a manager-approved full reset and restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-api-reset-"));
    const requestRestart = vi.fn();
    const { app, database, databasePath } = createFileBackedTestServer(root, { requestRestart });

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const reset = await app.inject({
      method: "POST",
      url: "/system/full-reset",
      headers: { "x-device-token": "test-admin-token" },
      payload: {
        confirmationText: "RESET HUB",
        includeBackups: false,
        managerApproval: { pin: "4321", reason: "Full reset hub", approvedBy: "manager" }
      }
    });

    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ scheduled: true, restartRequired: true, includeBackups: false });
    expect(existsSync(join(root, "backups", "reset-pending.json"))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requestRestart).toHaveBeenCalledTimes(1);

    await app.close();
    database.close();
    BackupService.applyPendingReset(databasePath, join(root, "backups"));
    expect(existsSync(databasePath)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("manages manual backup create, delete, restore, and pending restore with Master PIN", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-api-backups-"));
    const requestRestart = vi.fn();
    const { app, database } = createFileBackedTestServer(root, { requestRestart });
    const headers = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "PUT",
      url: "/settings/master-pin",
      headers,
      payload: { newPin: "9876", confirmPin: "9876", updatedBy: "owner" }
    });
    const created = await app.inject({ method: "POST", url: "/backups", headers, payload: { label: "Before festival menu" } });
    const backup = created.json<{ fileName: string; label: string; kind: string }>();
    const list = await app.inject({ method: "GET", url: "/backups", headers });
    const deleteWithoutPin = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent(backup.fileName)}`,
      headers,
      payload: { confirmationText: backup.fileName }
    });
    const deleteWrongConfirm = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent(backup.fileName)}`,
      headers,
      payload: { confirmationText: "wrong", masterApproval: { pin: "9876", reason: "Delete backup", approvedBy: "owner" } }
    });
    const deleteSpacedConfirm = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent(backup.fileName)}`,
      headers,
      payload: { confirmationText: ` ${backup.fileName} `, masterApproval: { pin: "9876", reason: "Delete backup", approvedBy: "owner" } }
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent(backup.fileName)}`,
      headers,
      payload: { confirmationText: backup.fileName, masterApproval: { pin: "9876", reason: "Delete backup", approvedBy: "owner" } }
    });

    expect(created.statusCode).toBe(200);
    expect(backup).toMatchObject({ label: "Before festival menu", kind: "manual" });
    expect(list.json()).toEqual([expect.objectContaining({ fileName: backup.fileName, label: "Before festival menu", kind: "manual" })]);
    expect(deleteWithoutPin.statusCode).toBe(403);
    expect(deleteWrongConfirm.statusCode).toBe(400);
    expect(deleteSpacedConfirm.statusCode).toBe(400);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ deleted: true, fileName: backup.fileName });

    const directBackupService = new BackupService(database, join(root, "hub.sqlite"), join(root, "backups"));
    const corruptManualBackup = await directBackupService.createBackup("Corrupt manual backup");
    writeFileSync(join(root, "backups", corruptManualBackup.fileName), "not sqlite");
    const automaticBackup = await directBackupService.createBackup("pre-update-test", "automatic");
    const deleteCorruptManual = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent(corruptManualBackup.fileName)}`,
      headers,
      payload: { confirmationText: corruptManualBackup.fileName, masterApproval: { pin: "9876", reason: "Delete corrupt manual backup", approvedBy: "owner" } }
    });
    const deleteAutomatic = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent(automaticBackup.fileName)}`,
      headers,
      payload: { confirmationText: automaticBackup.fileName, masterApproval: { pin: "9876", reason: "Delete automatic backup", approvedBy: "owner" } }
    });
    const deleteTraversal = await app.inject({
      method: "DELETE",
      url: `/backups/${encodeURIComponent("../outside.sqlite")}`,
      headers,
      payload: { confirmationText: "../outside.sqlite", masterApproval: { pin: "9876", reason: "Delete bad path", approvedBy: "owner" } }
    });
    const deleteNonSqlite = await app.inject({
      method: "DELETE",
      url: "/backups/notes.txt",
      headers,
      payload: { confirmationText: "notes.txt", masterApproval: { pin: "9876", reason: "Delete bad file", approvedBy: "owner" } }
    });
    const deleteMissing = await app.inject({
      method: "DELETE",
      url: "/backups/missing.sqlite",
      headers,
      payload: { confirmationText: "missing.sqlite", masterApproval: { pin: "9876", reason: "Delete missing backup", approvedBy: "owner" } }
    });

    expect(deleteCorruptManual.statusCode).toBe(200);
    expect(deleteCorruptManual.json()).toEqual({ deleted: true, fileName: corruptManualBackup.fileName });
    expect(deleteAutomatic.statusCode).toBe(400);
    expect(deleteAutomatic.json()).toEqual({ error: "Automatic safety backups cannot be deleted" });
    expect(deleteTraversal.statusCode).toBe(400);
    expect(deleteNonSqlite.statusCode).toBe(400);
    expect(deleteMissing.statusCode).toBe(400);

    const restoreBackup = (await app.inject({ method: "POST", url: "/backups", headers, payload: { label: "Before restore test" } })).json<{ fileName: string }>();
    const secondRestoreBackup = (await app.inject({ method: "POST", url: "/backups", headers, payload: { label: "Second restore test" } })).json<{ fileName: string }>();
    insertApiDailySnapshot(database, { id: "api-restore-open", businessDate: "2026-05-30", finalSalesPaise: 0, status: "active" });
    const activeOrderRestore = await app.inject({
      method: "POST",
      url: "/backups/restore",
      headers,
      payload: { fileName: restoreBackup.fileName, confirmationText: restoreBackup.fileName, masterApproval: { pin: "9876", reason: "Restore backup", approvedBy: "owner" } }
    });
    database.db.prepare("UPDATE orders SET status = 'cancelled' WHERE status IN ('open', 'billed')").run();
    const spacedRestoreConfirm = await app.inject({
      method: "POST",
      url: "/backups/restore",
      headers,
      payload: {
        fileName: restoreBackup.fileName,
        confirmationText: ` ${restoreBackup.fileName} `,
        masterApproval: { pin: "9876", reason: "Restore backup", approvedBy: "owner" }
      }
    });
    const scheduled = await app.inject({
      method: "POST",
      url: "/backups/restore",
      headers,
      payload: {
        fileName: restoreBackup.fileName,
        confirmationText: restoreBackup.fileName,
        masterApproval: { pin: "9876", reason: "Restore backup", approvedBy: "owner" }
      }
    });
    const overwritePending = await app.inject({
      method: "POST",
      url: "/backups/restore",
      headers,
      payload: {
        fileName: secondRestoreBackup.fileName,
        confirmationText: secondRestoreBackup.fileName,
        masterApproval: { pin: "9876", reason: "Restore backup", approvedBy: "owner" }
      }
    });
    const pending = await app.inject({ method: "GET", url: "/backups/restore-pending", headers });
    const restarted = await app.inject({
      method: "POST",
      url: "/backups/restore-pending/restart",
      headers,
      payload: { masterApproval: { pin: "9876", reason: "Restart pending restore", approvedBy: "owner" } }
    });
    const cancelWrongPin = await app.inject({
      method: "DELETE",
      url: "/backups/restore-pending",
      headers,
      payload: { masterApproval: { pin: "0000", reason: "Cancel restore", approvedBy: "owner" } }
    });
    const canceled = await app.inject({
      method: "DELETE",
      url: "/backups/restore-pending",
      headers,
      payload: { masterApproval: { pin: "9876", reason: "Cancel restore", approvedBy: "owner" } }
    });

    expect(activeOrderRestore.statusCode).toBe(400);
    expect(activeOrderRestore.json()).toEqual({ error: "Close or settle running orders before restoring a backup" });
    expect(spacedRestoreConfirm.statusCode).toBe(400);
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json()).toMatchObject({ scheduled: true, restartRequired: true, restartNow: false });
    expect(overwritePending.statusCode).toBe(400);
    expect(overwritePending.json()).toEqual({ error: "A restore is already scheduled. Cancel pending restore before scheduling another." });
    expect(restarted.statusCode).toBe(200);
    expect(restarted.json()).toMatchObject({ restarting: true, pendingRestore: { backup: { fileName: restoreBackup.fileName } } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requestRestart).toHaveBeenCalledTimes(1);
    expect(pending.json()).toMatchObject({ backup: { fileName: restoreBackup.fileName } });
    expect(cancelWrongPin.statusCode).toBe(403);
    expect(canceled.json()).toEqual({ canceled: true });
    expect(existsSync(join(root, "backups", "restore-pending.json"))).toBe(false);

    const immediateScheduled = await app.inject({
      method: "POST",
      url: "/backups/restore",
      headers,
      payload: {
        fileName: restoreBackup.fileName,
        confirmationText: restoreBackup.fileName,
        restartNow: true,
        masterApproval: { pin: "9876", reason: "Restore backup now", approvedBy: "owner" }
      }
    });
    expect(immediateScheduled.statusCode).toBe(200);
    expect(immediateScheduled.json()).toMatchObject({ scheduled: true, restartRequired: true, restartNow: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requestRestart).toHaveBeenCalledTimes(2);

    await app.close();
    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("saves masked hub cloud settings behind Manager PIN and tests cloud connectivity", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token", "x-manager-pin": "1234" };
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "1234", updatedBy: "admin" }
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "active" }), { status: 200 }));

    const save = await app.inject({
      method: "PUT",
      url: "/settings/hub-connection",
      headers,
      payload: {
        cloudUrl: "https://example.convex.site",
        installationId: "install-main",
        syncSecret: "secret-main",
        hubPublicUrl: "http://192.168.1.20:3737"
      }
    });
    const masked = await app.inject({ method: "GET", url: "/settings/hub-connection", headers: { "x-device-token": "test-admin-token" } });
    const revealed = await app.inject({ method: "GET", url: "/settings/hub-connection?reveal=1", headers });
    const test = await app.inject({ method: "POST", url: "/settings/hub-connection/test", headers, payload: {} });

    expect(save.statusCode).toBe(200);
    expect(masked.json()).toMatchObject({ configured: true, syncSecret: "••••••••••••" });
    expect(revealed.json()).toMatchObject({ syncSecret: "secret-main" });
    expect(test.json()).toMatchObject({ status: "connected" });
    expect(fetchSpy).toHaveBeenCalledWith("https://example.convex.site/pos/license-check", expect.any(Object));

    await app.close();
    database.close();
  });

  it("keeps cloud backup off by default and requires Master PIN to toggle it", async () => {
    const { app, database } = createTestServer();
    await app.inject({
      method: "PUT",
      url: "/settings/master-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "9876", confirmPin: "9876", updatedBy: "owner" }
    });

    const initial = await app.inject({ method: "GET", url: "/settings/cloud-backup", headers: { "x-device-token": "test-admin-token" } });
    const withoutPin = await app.inject({
      method: "PUT",
      url: "/settings/cloud-backup",
      headers: { "x-device-token": "test-admin-token" },
      payload: { enabled: true }
    });
    const withMasterPin = await app.inject({
      method: "PUT",
      url: "/settings/cloud-backup",
      headers: { "x-device-token": "test-admin-token" },
      payload: { enabled: true, masterApproval: { pin: "9876", reason: "Enable cloud backup", approvedBy: "owner" } }
    });
    const bootstrap = await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": "test-admin-token" } });
    const badPin = await app.inject({
      method: "PUT",
      url: "/settings/cloud-backup",
      headers: { "x-device-token": "test-admin-token" },
      payload: { enabled: false, masterApproval: { pin: "1234", reason: "Disable cloud backup", approvedBy: "owner" } }
    });

    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ enabled: false });
    expect(withoutPin.statusCode).toBe(403);
    expect(withoutPin.json()).toEqual({ error: "Master PIN is required for this action" });
    expect(withMasterPin.statusCode).toBe(200);
    expect(withMasterPin.json()).toEqual({ enabled: true });
    expect(bootstrap.json<{ setup: { cloudBackupEnabled: boolean } }>().setup.cloudBackupEnabled).toBe(true);
    expect(badPin.statusCode).toBe(403);
    expect(badPin.json()).toEqual({ error: "Master PIN is incorrect" });

    await app.close();
    database.close();
  });

  it("blocks manual cloud backup routes while off but still allows license checks", async () => {
    const hub = createTestHub();
    const pushPending = vi.fn().mockResolvedValue({ pushed: 1, skipped: false });
    const pullCloudSnapshot = vi.fn().mockResolvedValue({ applied: 1, failed: 0, skipped: false });
    const requeueFailedEvents = vi.fn().mockReturnValue({ requeued: 1 });
    const fetchBackupManifest = vi.fn().mockResolvedValue({ manifests: [] });
    const restoreFromCloud = vi.fn().mockResolvedValue({ restored: true, imported: 0, kind: "table_layout" });
    const checkLicenseOnline = vi.fn().mockResolvedValue({ status: "active", message: "License is active." });
    const app = createHubServer({
      database: hub.database,
      backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
      authService: hub.authService,
      orderService: hub.orderService,
      printJobService: new PrintJobService(hub.database.orm, new DryRunPrinterAdapter()),
      syncBridge: {
        pushPending,
        pullCloudSnapshot,
        requeueFailedEvents,
        fetchBackupManifest,
        restoreFromCloud,
        checkLicenseOnline,
        getLicenseState: () => ({ status: "active", message: "License is active." })
      } as unknown as ConvexSyncBridge,
      eventBus: new EventBus<unknown>()
    });
    const headers = { "x-device-token": "test-admin-token" };

    const push = await app.inject({ method: "POST", url: "/sync/push", headers });
    const pull = await app.inject({ method: "POST", url: "/sync/pull", headers });
    const requeue = await app.inject({ method: "POST", url: "/sync/requeue-failed", headers });
    const manifest = await app.inject({ method: "GET", url: "/cloud-backup/manifest", headers });
    const restore = await app.inject({
      method: "POST",
      url: "/cloud-backup/restore",
      headers,
      payload: { kind: "table_layout" }
    });
    const license = await app.inject({ method: "POST", url: "/license/check", headers, payload: {} });

    for (const response of [push, pull, requeue, manifest, restore]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Cloud Backup is off. Enable it with Master PIN before using cloud backup." });
    }
    expect(pushPending).not.toHaveBeenCalled();
    expect(pullCloudSnapshot).not.toHaveBeenCalled();
    expect(requeueFailedEvents).not.toHaveBeenCalled();
    expect(fetchBackupManifest).not.toHaveBeenCalled();
    expect(restoreFromCloud).not.toHaveBeenCalled();
    expect(license.statusCode).toBe(200);
    expect(checkLicenseOnline).toHaveBeenCalledTimes(1);

    await app.close();
    hub.database.close();
  });

  it("pairs a waiter device and enforces role permissions", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);

    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Waiter phone", "waiter")
    });
    const pairing = pairingResponse.json<{
      code: string;
      qrDataUrl: string;
      pairingPayload: { kind: string; hubUrl: string; code: string; role: string };
      pairingPayloadText: string;
    }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Waiter phone" }
    });
    const device = exchangeResponse.json<{ token: string }>();
    const meResponse = await app.inject({
      method: "GET",
      url: "/devices/me",
      headers: { "x-device-token": device.token }
    });

    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: { "x-device-token": device.token },
      payload: {
        tableId: "table-t1",
        captainId: "spoofed-waiter",
        pax: 2,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const orderRow = database.db.prepare("SELECT captain_id, created_by_role FROM orders WHERE id = ?").get(order.orderId);
    const waiterStateEditResponse = await app.inject({
      method: "POST",
      url: `/orders/${order.orderId}/state`,
      headers: { "x-device-token": device.token },
      payload: { saveMode: "save", items: [{ menuItemId: "item-dal-fry", quantity: 2 }] }
    });
    const settleResponse = await app.inject({
      method: "POST",
      url: "/bills/not-real/settle",
      headers: { "x-device-token": device.token },
      payload: { method: "cash", amountPaise: 1, receivedBy: "captain-1" }
    });
    await app.inject({
      method: "POST",
      url: `/bills/${order.orderId}/generate`,
      headers: adminHeaders
    });
    const waiterFullOrderResponse = await app.inject({
      method: "GET",
      url: `/orders/${order.orderId}`,
      headers: { "x-device-token": device.token }
    });
    const waiterTableOrderResponse = await app.inject({
      method: "GET",
      url: "/tables/table-t1/order",
      headers: { "x-device-token": device.token }
    });
    const waiterBootstrapResponse = await app.inject({
      method: "GET",
      url: "/sync/bootstrap",
      headers: { "x-device-token": device.token }
    });
    const waiterTableOrder = waiterTableOrderResponse.json<Record<string, unknown>>();
    const waiterFullOrder = waiterFullOrderResponse.json<Record<string, unknown>>();
    const waiterBootstrap = waiterBootstrapResponse.json<Record<string, unknown>>();

    expect(pairing.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(pairing.pairingPayload).toMatchObject({
      kind: "gaurav-pos-pairing",
      code: pairing.code,
      role: "waiter"
    });
    expect(JSON.parse(pairing.pairingPayloadText).hubUrl).toBe(pairing.pairingPayload.hubUrl);
    expect(exchangeResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({ name: "Waiter phone", role: "waiter" });
    expect(orderResponse.statusCode).toBe(200);
    expect(orderRow).toEqual({ captain_id: "Waiter phone", created_by_role: "waiter" });
    expect(waiterStateEditResponse.statusCode).toBe(403);
    expect(settleResponse.statusCode).toBe(403);
    expect(waiterTableOrderResponse.statusCode).toBe(200);
    expect(waiterTableOrder.bill).toBeNull();
    expect(waiterTableOrder).not.toHaveProperty("payments");
    expect(waiterTableOrder).not.toHaveProperty("kots");
    expect(waiterFullOrderResponse.statusCode).toBe(200);
    expect(waiterFullOrder.bill).toBeNull();
    expect(waiterFullOrder).not.toHaveProperty("payments");
    expect(waiterFullOrder).not.toHaveProperty("kots");
    expect(waiterBootstrap).not.toHaveProperty("syncStatus");
    expect(waiterBootstrap).not.toHaveProperty("printJobs");
    expect(waiterBootstrap).not.toHaveProperty("ticketTemplate");

    await app.close();
    database.close();
  });

  it("requires Manager PIN approval before creating device pairing QR codes", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });

    const withoutApproval = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: { deviceName: "Waiter phone", role: "waiter", expiresInMinutes: 10 }
    });
    const withApproval = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: {
        deviceName: "Waiter phone",
        role: "waiter",
        expiresInMinutes: 10,
        managerApproval: { pin: "4321", reason: "Pair captain phone", approvedBy: "owner" }
      }
    });

    expect(withoutApproval.statusCode).toBe(403);
    expect(withApproval.statusCode).toBe(200);
    expect(withApproval.json<{ pairingPayload: { role: string } }>().pairingPayload.role).toBe("waiter");

    await app.close();
    database.close();
  });

  it("leaves legacy sync outbox rows untouched from the deprecated admin endpoint", async () => {
    const { app, database } = createTestServer();
    enableCloudBackup(database);
    database.db
      .prepare("INSERT INTO event_log (event_id, type, aggregate_type, aggregate_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("event-requeue-1", "test.event", "test", "test-1", "{}", new Date().toISOString());
    database.db
      .prepare("INSERT INTO sync_outbox (event_id, status, attempts, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("event-requeue-1", "failed", 10, "old outage", new Date().toISOString(), new Date().toISOString());

    const response = await app.inject({
      method: "POST",
      url: "/sync/requeue-failed",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ requeued: 0 });
    expect(database.db.prepare("SELECT status, attempts, last_error FROM sync_outbox").get()).toEqual({
      status: "failed",
      attempts: 10,
      last_error: "old outage"
    });

    await app.close();
    database.close();
  });

  it("lets admins mark cloud command failures resolved", async () => {
    const { app, database } = createTestServer();
    database.orm
      .insert(cloudCommandFailures)
      .values({
        commandId: "cmd-bad-menu",
        type: "menu_item.upsert",
        payloadJson: "{}",
        error: "Menu item id is required",
        failedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      })
      .run();

    const response = await app.inject({
      method: "DELETE",
      url: "/sync/cloud-command-failures/cmd-bad-menu",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ commandId: "cmd-bad-menu", resolved: true });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM cloud_command_failures").get()).toEqual({ count: 0 });

    await app.close();
    database.close();
  });

  it("throttles repeated invalid pairing code exchanges", async () => {
    const { app, database } = createTestServer();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/devices/pair/exchange",
        payload: { code: "000000", deviceName: "Unknown phone" }
      });
      expect(response.statusCode).toBe(401);
    }
    const locked = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: "000000", deviceName: "Unknown phone" }
    });

    expect(locked.statusCode).toBe(429);

    await app.close();
    database.close();
  });
});
