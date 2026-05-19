import AdmZip from "adm-zip";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BackupService } from "../db/backup-service.js";
import { HubDatabase } from "../db/database.js";
import { currentDbSchemaVersion } from "../db/schema-version.js";
import { AuthService } from "../domain/auth-service.js";
import { OrderService } from "../domain/order-service.js";
import { AppUpdateService } from "../update/app-update-service.js";
import { PACKAGED_SQLITE_NATIVE_PATH, sha256, type UpdatePackageManifest } from "../update/update-package.js";

describe("AppUpdateService", () => {
  it("blocks update install while running orders exist", async () => {
    const fixture = createFixture();
    const service = createService(fixture);
    service.registerBaseline(writePackage(fixture.root, "0.1.0"));
    fixture.orderService.submitOrder({
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 2,
      orderType: "dine_in",
      items: [{ menuItemId: "item-paneer-tikka", quantity: 1 }]
    });

    await expect(service.installUpdate(writePackage(fixture.root, "0.2.0"))).rejects.toThrow("running order");

    fixture.close();
  });

  it("creates a pre-update backup and rollback script before launching installer", async () => {
    const fixture = createFixture();
    const launchInstaller = vi.fn();
    const service = createService(fixture, { launchInstaller });
    service.registerBaseline(writePackage(fixture.root, "0.1.0"));

    const result = await service.installUpdate(writePackage(fixture.root, "0.2.0"));

    expect(existsSync(result.backup.path)).toBe(true);
    expect(existsSync(result.recoveryScriptPath)).toBe(true);
    expect(launchInstaller).toHaveBeenCalledWith(expect.stringContaining("Gaurav POS Hub Setup 0.2.0.exe"));
    expect(service.status().rollbackAvailable).toBe(true);

    fixture.close();
  });

  it("registers the current package as the rollback baseline without launching installer", () => {
    const fixture = createFixture();
    const launchInstaller = vi.fn();
    const service = createService(fixture, { launchInstaller });

    const baseline = service.registerBaseline(writePackage(fixture.root, "0.1.0"));

    expect(baseline.version).toBe("0.1.0");
    expect(service.status().baselineRegistered).toBe(true);
    expect(launchInstaller).not.toHaveBeenCalled();

    fixture.close();
  });

  it("registers the current installer as the rollback baseline for first installs", () => {
    const fixture = createFixture();
    const launchInstaller = vi.fn();
    const service = createService(fixture, { launchInstaller, sqliteNativePath: fixture.sqliteNativePath });
    const installerPath = writeInstaller(fixture.root, "0.1.0");

    const baseline = service.registerInstallerBaseline(installerPath);

    expect(baseline.version).toBe("0.1.0");
    expect(baseline.packagePath).toBe(baseline.installerPath);
    expect(existsSync(baseline.installerPath)).toBe(true);
    expect(service.status().baselineRegistered).toBe(true);
    expect(launchInstaller).not.toHaveBeenCalled();

    fixture.close();
  });

  it("does not require unpacking the installer when registering a current rollback baseline", () => {
    const fixture = createFixture();
    const service = createService(fixture, { sqliteNativePath: fixture.sqliteNativePath });
    const installerPath = join(fixture.root, "Gaurav POS Hub Setup 0.1.0.exe");
    writeFileSync(installerPath, Buffer.from("MZ".padEnd(1024, "\0"), "binary"));

    const baseline = service.registerInstallerBaseline(installerPath);

    expect(baseline.version).toBe("0.1.0");
    expect(service.status().baselineRegistered).toBe(true);

    fixture.close();
  });

  it("rejects an installer baseline when the filename does not match the running version", () => {
    const fixture = createFixture();
    const service = createService(fixture, { sqliteNativePath: fixture.sqliteNativePath });

    expect(() => service.registerInstallerBaseline(writeInstaller(fixture.root, "0.0.9"))).toThrow("does not match running app");

    fixture.close();
  });

  it("returns a clean validation error when pasted installer path cannot be read", () => {
    const fixture = createFixture();
    const service = createService(fixture, { sqliteNativePath: fixture.sqliteNativePath });
    const installerPath = join(fixture.root, "Gaurav POS Hub Setup 0.1.0.exe");
    mkdirSync(installerPath);

    expect(() => service.registerInstallerBaseline(installerPath)).toThrow("Current installer file could not be read");

    fixture.close();
  });

  it("schedules rollback restore and launches cached previous installer", async () => {
    const fixture = createFixture();
    const launchInstaller = vi.fn();
    const service = createService(fixture, { launchInstaller });
    service.registerBaseline(writePackage(fixture.root, "0.1.0"));
    await service.installUpdate(writePackage(fixture.root, "0.2.0"));

    const result = await service.rollback();

    expect(result.rollingBack).toBe(true);
    expect(existsSync(join(fixture.backupDir, "restore-pending.json"))).toBe(false);
    expect(launchInstaller).toHaveBeenLastCalledWith(expect.stringContaining("Rollback Gaurav POS Update.cmd"));
    expect(readFileSync(join(fixture.root, "updates", "Rollback Gaurav POS Update.cmd"), "utf8")).toContain("Wait-Process");

    fixture.close();
  });

  it("finds a newer stable GitHub release update and ignores drafts/prereleases", async () => {
    const fixture = createFixture();
    const packagePath = writePackage(fixture.root, "0.2.0");
    const fetch = createGithubFetch({
      releases: [
        releaseFixture({ tagName: "hub-v0.3.0", prerelease: true, assetName: "Gaurav POS Hub-0.3.0.gpos-update.zip", bytes: readFileSync(packagePath) }),
        releaseFixture({ tagName: "hub-v0.2.0", assetName: "Gaurav POS Hub-0.2.0.gpos-update.zip", bytes: readFileSync(packagePath) })
      ]
    });
    const service = createService(fixture, { githubFetch: fetch });

    const result = await service.checkGithubLatest();

    expect(result.status).toBe("update_available");
    expect(result.latestVersion).toBe("0.2.0");
    expect(result.release?.tagName).toBe("hub-v0.2.0");
    expect(result.asset?.name).toBe("Gaurav POS Hub-0.2.0.gpos-update.zip");
    expect(result.installRequest).toEqual({
      tagName: "hub-v0.2.0",
      assetName: "Gaurav POS Hub-0.2.0.gpos-update.zip",
      expectedVersion: "0.2.0"
    });

    fixture.close();
  });

  it("returns up to date when the latest GitHub package is not newer", async () => {
    const fixture = createFixture();
    const packagePath = writePackage(fixture.root, "0.1.0");
    const service = createService(fixture, {
      githubFetch: createGithubFetch({
        releases: [releaseFixture({ tagName: "hub-v0.1.0", assetName: "Gaurav POS Hub-0.1.0.gpos-update.zip", bytes: readFileSync(packagePath) })]
      })
    });

    const result = await service.checkGithubLatest();

    expect(result.status).toBe("up_to_date");
    expect(result.latestVersion).toBe("0.1.0");

    fixture.close();
  });

  it("downloads, validates, backs up, and launches a GitHub update install", async () => {
    const fixture = createFixture();
    const launchInstaller = vi.fn();
    const packagePath = writePackage(fixture.root, "0.2.0");
    const service = createService(fixture, {
      launchInstaller,
      githubFetch: createGithubFetch({
        releases: [releaseFixture({ tagName: "hub-v0.2.0", assetName: "Gaurav POS Hub-0.2.0.gpos-update.zip", bytes: readFileSync(packagePath) })]
      })
    });
    service.registerBaseline(writePackage(fixture.root, "0.1.0"));

    const result = await service.installGithubUpdate({
      tagName: "hub-v0.2.0",
      assetName: "Gaurav POS Hub-0.2.0.gpos-update.zip",
      expectedVersion: "0.2.0"
    });

    expect(existsSync(result.backup.path)).toBe(true);
    expect(launchInstaller).toHaveBeenCalledWith(expect.stringContaining("Gaurav POS Hub Setup 0.2.0.exe"));
    expect(service.status().rollbackAvailable).toBe(true);

    fixture.close();
  });

  it("fails a bad GitHub package before creating a backup or launching installer", async () => {
    const fixture = createFixture();
    const launchInstaller = vi.fn();
    const service = createService(fixture, {
      launchInstaller,
      githubFetch: createGithubFetch({
        releases: [releaseFixture({ tagName: "hub-v0.2.0", assetName: "Gaurav POS Hub-0.2.0.gpos-update.zip", bytes: Buffer.from("bad zip") })]
      })
    });
    service.registerBaseline(writePackage(fixture.root, "0.1.0"));

    await expect(service.installGithubUpdate({
      tagName: "hub-v0.2.0",
      assetName: "Gaurav POS Hub-0.2.0.gpos-update.zip",
      expectedVersion: "0.2.0"
    })).rejects.toThrow("GitHub update package is invalid");

    expect(launchInstaller).not.toHaveBeenCalled();
    expect(existsSync(fixture.backupDir) ? readdirSync(fixture.backupDir) : []).toEqual([]);

    fixture.close();
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "gpos-update-service-"));
  const databasePath = join(root, "hub.sqlite");
  const backupDir = join(root, "backups");
  const sqliteNativePath = join(root, "better_sqlite3.node");
  writeFileSync(sqliteNativePath, makePeNative());
  const database = new HubDatabase(databasePath);
  database.migrate();
  database.markAppSchemaVersion(currentDbSchemaVersion());
  database.seedDemoData();
  const backupService = new BackupService(database, databasePath, backupDir);
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice("test-admin-token");
  const orderService = new OrderService(database.orm);
  return {
    root,
    database,
    databasePath,
    sqliteNativePath,
    backupDir,
    backupService,
    orderService,
    close: () => {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
}

function createService(
  fixture: ReturnType<typeof createFixture>,
  overrides: Partial<ConstructorParameters<typeof AppUpdateService>[0]> = {}
) {
  return new AppUpdateService({
    database: fixture.database,
    backupService: fixture.backupService,
    updateDir: join(fixture.root, "updates"),
    appVersion: "0.1.0",
    dbSchemaVersion: currentDbSchemaVersion(),
    databasePath: fixture.databasePath,
    exitApp: () => undefined,
    ...overrides
  });
}

function writePackage(root: string, version: string, patch: PartialDeep<Record<string, unknown>> = {}) {
  const sqliteBytes = makePeNative();
  const installerBytes = makeInstallerBytes(sqliteBytes);
  const manifest = mergeManifest(
    {
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
    },
    patch
  ) as UpdatePackageManifest;
  const zip = new AdmZip();
  zip.addFile("gpos-update.json", Buffer.from(JSON.stringify(manifest), "utf8"));
  zip.addFile(manifest.installer.fileName, installerBytes);
  zip.addFile(manifest.sqliteNative.fileName, sqliteBytes);
  const packagePath = join(root, `Gaurav POS Hub ${version}.gpos-update.zip`);
  zip.writeZip(packagePath);
  return packagePath;
}

function writeInstaller(root: string, version: string) {
  const installerPath = join(root, `Gaurav POS Hub Setup ${version}.exe`);
  writeFileSync(installerPath, makeInstallerBytes(makePeNative()));
  return installerPath;
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

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<Record<string, unknown>> : unknown;
};

function mergeManifest<T extends Record<string, unknown>>(base: T, patch: PartialDeep<Record<string, unknown>>): T {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key as keyof T] = mergeManifest((base[key] ?? {}) as Record<string, unknown>, value as PartialDeep<Record<string, unknown>>) as T[keyof T];
    } else if (value !== undefined) {
      merged[key as keyof T] = value as T[keyof T];
    }
  }
  return merged;
}

function releaseFixture(input: { tagName: string; assetName?: string; bytes?: Buffer; draft?: boolean; prerelease?: boolean }) {
  return {
    tag_name: input.tagName,
    name: input.tagName,
    html_url: `https://github.com/shubham909090/Open-POS/releases/tag/${input.tagName}`,
    published_at: "2026-05-20T00:00:00Z",
    body: "Release notes",
    draft: input.draft ?? false,
    prerelease: input.prerelease ?? false,
    assets: input.assetName
      ? [
          {
            name: input.assetName,
            size: input.bytes?.length ?? 0,
            browser_download_url: `https://downloads.example/${input.assetName}`,
            __bytes: input.bytes
          }
        ]
      : []
  };
}

function createGithubFetch(input: { releases: ReturnType<typeof releaseFixture>[] }) {
  return vi.fn(async (url: string) => {
    if (url.includes("api.github.com")) return jsonResponse(input.releases);
    const asset = input.releases.flatMap((release) => release.assets).find((candidate) => url.endsWith(candidate.name));
    if (!asset) return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = asset.__bytes ?? Buffer.alloc(0);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
  });
}

function jsonResponse(value: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => value,
    arrayBuffer: async () => new ArrayBuffer(0)
  };
}
