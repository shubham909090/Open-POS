import AdmZip from "adm-zip";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHubServer } from "../api/server.js";
import { BackupService } from "../db/backup-service.js";
import { HubDatabase } from "../db/database.js";
import { currentDbSchemaVersion } from "../db/schema-version.js";
import { AuthService } from "../domain/auth-service.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { AppUpdateService } from "../update/app-update-service.js";
import { PACKAGED_SQLITE_NATIVE_PATH, sha256, type UpdatePackageManifest } from "../update/update-package.js";

describe("app update API", () => {
  it("requires Manager PIN to install an update", async () => {
    const fixture = createFixture();
    await setManagerPin(fixture.app);
    fixture.updateService.registerBaseline(writePackage(fixture.root, "0.1.0"));

    const response = await fixture.app.inject({
      method: "POST",
      url: "/system/update/install",
      headers: { "x-device-token": "test-admin-token" },
      payload: { packagePath: writePackage(fixture.root, "0.2.0") }
    });

    expect(response.statusCode).toBe(403);

    await fixture.close();
  });

  it("blocks update install through the API when orders are still running", async () => {
    const fixture = createFixture();
    await setManagerPin(fixture.app);
    fixture.updateService.registerBaseline(writePackage(fixture.root, "0.1.0"));
    fixture.orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1 }]
    });

    const response = await fixture.app.inject({
      method: "POST",
      url: "/system/update/install",
      headers: { "x-device-token": "test-admin-token", "x-manager-pin": "1234" },
      payload: { packagePath: writePackage(fixture.root, "0.2.0") }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toContain("running order");

    await fixture.close();
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "gpos-update-api-"));
  const databasePath = join(root, "hub.sqlite");
  const backupDir = join(root, "backups");
  const database = new HubDatabase(databasePath);
  database.migrate();
  database.markAppSchemaVersion(currentDbSchemaVersion());
  database.seedDemoData();
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice("test-admin-token");
  const orderService = new OrderService(database.orm);
  const backupService = new BackupService(database, databasePath, backupDir);
  const updateService = new AppUpdateService({
    database,
    backupService,
    updateDir: join(root, "updates"),
    appVersion: "0.1.0",
    dbSchemaVersion: currentDbSchemaVersion(),
    databasePath,
    launchInstaller: vi.fn(),
    exitApp: () => undefined
  });
  const app = createHubServer({
    database,
    backupService,
    appUpdateService: updateService,
    authService,
    orderService,
    printJobService: new PrintJobService(database.orm, new DryRunPrinterAdapter()),
    syncBridge: new ConvexSyncBridge(database.orm, undefined, undefined),
    eventBus: new EventBus<unknown>()
  });
  return {
    root,
    app,
    database,
    orderService,
    updateService,
    close: async () => {
      await app.close();
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
}

async function setManagerPin(app: ReturnType<typeof createHubServer>) {
  await app.inject({
    method: "PUT",
    url: "/settings/manager-pin",
    headers: { "x-device-token": "test-admin-token" },
    payload: { newPin: "1234", updatedBy: "owner" }
  });
}

function writePackage(root: string, version: string) {
  const sqliteBytes = makePeNative();
  const installerBytes = makeInstallerBytes(sqliteBytes);
  const manifest: UpdatePackageManifest = {
    schemaVersion: 1,
    appId: "in.gaurav.pos.hub",
    productName: "Gaurav POS Hub",
    version,
    platform: "win32",
    arch: "x64",
    electronVersion: "38.8.6",
    dbSchemaVersion: currentDbSchemaVersion(),
    minSourceDbSchemaVersion: 0,
    createdAt: new Date().toISOString(),
    installer: {
      fileName: `Gaurav POS Hub Setup ${version}.exe`,
      sha256: sha256(installerBytes),
      sizeBytes: installerBytes.length
    },
    sqliteNative: {
      fileName: PACKAGED_SQLITE_NATIVE_PATH,
      sha256: sha256(sqliteBytes),
      sizeBytes: sqliteBytes.length,
      format: "pe32plus-x64"
    }
  };
  const zip = new AdmZip();
  zip.addFile("gpos-update.json", Buffer.from(JSON.stringify(manifest), "utf8"));
  zip.addFile(manifest.installer.fileName, installerBytes);
  zip.addFile(manifest.sqliteNative.fileName, sqliteBytes);
  const packagePath = join(root, `Gaurav POS Hub ${version}.gpos-update.zip`);
  zip.writeZip(packagePath);
  return packagePath;
}

function makePeNative() {
  const bytes = Buffer.alloc(128);
  bytes.write("MZ", 0, "ascii");
  bytes.writeUInt32LE(0x40, 0x3c);
  bytes.write("PE\0\0", 0x40, "ascii");
  bytes.writeUInt16LE(0x8664, 0x44);
  bytes.writeUInt16LE(0x20b, 0x58);
  return bytes;
}

function makeInstallerBytes(sqliteBytes: Buffer) {
  const installer = new AdmZip();
  installer.addFile("resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node", sqliteBytes);
  return Buffer.concat([Buffer.from("MZ".padEnd(1024, "\0"), "binary"), installer.toBuffer()]);
}
