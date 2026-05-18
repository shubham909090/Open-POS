import AdmZip from "adm-zip";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKAGED_SQLITE_NATIVE_PATH, sha256, validateUpdatePackage, validateWindowsX64NativeModule, type UpdatePackageManifest } from "../update/update-package.js";

describe("update package validation", () => {
  it("rejects packages for the wrong app", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-package-"));
    const packagePath = writePackage(root, { appId: "wrong.app" });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow();

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects packages that require a newer source DB schema", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-db-"));
    const packagePath = writePackage(root, { minSourceDbSchemaVersion: 11 });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow("Update requires DB schema 11");

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects packages whose target DB schema is older than the current DB", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-old-db-"));
    const packagePath = writePackage(root, { dbSchemaVersion: 9 });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow("older than current DB schema");

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unsafe installer file names", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-path-"));
    const packagePath = writePackage(root, { installer: { fileName: "../evil.exe" } });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow();

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects packages with a bad installer checksum", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-hash-"));
    const packagePath = writePackage(root, { installer: { sha256: "0".repeat(64) } });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow("Installer checksum mismatch");

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects packages whose installer embeds a different SQLite native binary", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-installer-native-"));
    const sqliteBytes = makePeNative(0x8664);
    const packagePath = writePackage(root, {}, { sqliteBytes, installerBytes: makeInstallerBytes(makePeNative(0xaa64)) });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow("Installer SQLite native binary does not match manifest");

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects missing or non-Windows SQLite native binaries", () => {
    expect(() => validateWindowsX64NativeModule(Buffer.from("not-a-pe"))).toThrow("not a Windows PE");
    expect(() => validateWindowsX64NativeModule(makePeNative(0x8664, 0x10b))).toThrow("not PE32+");

    const root = mkdtempSync(join(tmpdir(), "gpos-update-native-"));
    const packagePath = writePackage(root, {}, { sqliteBytes: makePeNative(0xaa64) });

    expect(() => validateUpdatePackage(packagePath, 10)).toThrow("not Windows x64");

    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a compatible Windows x64 package", () => {
    const root = mkdtempSync(join(tmpdir(), "gpos-update-ok-"));
    const packagePath = writePackage(root);

    expect(validateUpdatePackage(packagePath, 10).manifest.version).toBe("0.2.0");

    rmSync(root, { recursive: true, force: true });
  });
});

function writePackage(
  root: string,
  patch: PartialDeep<Record<string, unknown>> = {},
  options: { sqliteBytes?: Buffer; installerBytes?: Buffer } = {}
) {
  const sqliteBytes = options.sqliteBytes ?? makePeNative(0x8664);
  const installerBytes = options.installerBytes ?? makeInstallerBytes(sqliteBytes);
  const manifest = mergeManifest(
    {
      schemaVersion: 1,
      appId: "in.gaurav.pos.hub",
      productName: "Gaurav POS Hub",
      version: "0.2.0",
      platform: "win32",
      arch: "x64",
      electronVersion: "38.8.6",
      dbSchemaVersion: 10,
      minSourceDbSchemaVersion: 0,
      createdAt: new Date().toISOString(),
      installer: {
        fileName: "Gaurav POS Hub Setup 0.2.0.exe",
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
  const packagePath = join(root, "Gaurav POS Hub 0.2.0.gpos-update.zip");
  zip.writeZip(packagePath);
  return packagePath;
}

function makePeNative(machine: number, optionalMagic = 0x20b) {
  const bytes = Buffer.alloc(128);
  bytes.write("MZ", 0, "ascii");
  bytes.writeUInt32LE(0x40, 0x3c);
  bytes.write("PE\0\0", 0x40, "ascii");
  bytes.writeUInt16LE(machine, 0x44);
  bytes.writeUInt16LE(optionalMagic, 0x58);
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

function mergeManifest<T extends Record<string, unknown>>(base: T, patch: PartialDeep<T>): T {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key as keyof T] = mergeManifest((base[key] ?? {}) as Record<string, unknown>, value as Record<string, unknown>) as T[keyof T];
    } else if (value !== undefined) {
      merged[key as keyof T] = value as T[keyof T];
    }
  }
  return merged;
}
