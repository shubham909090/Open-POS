import AdmZip from "adm-zip";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";

export const UPDATE_PACKAGE_MANIFEST = "gpos-update.json";
export const UPDATE_APP_ID = "in.gaurav.pos.hub";
export const UPDATE_PLATFORM = "win32";
export const UPDATE_ARCH = "x64";
export const PACKAGED_SQLITE_NATIVE_PATH = "win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node";
const INSTALLER_SQLITE_NATIVE_SUFFIX = "resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node";
const require = createRequire(import.meta.url);
const { path7za } = require("7zip-bin") as { path7za?: string };

const safeVersionSchema = z.string().trim().regex(/^[0-9A-Za-z.-]+$/);
const safeInstallerFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value === basename(value) && !value.includes("..") && value.toLowerCase().endsWith(".exe"), "Installer file name must be a plain .exe file name");

export const updatePackageManifestSchema = z.object({
  schemaVersion: z.literal(1),
  appId: z.literal(UPDATE_APP_ID),
  productName: z.string().min(1),
  version: safeVersionSchema,
  platform: z.literal(UPDATE_PLATFORM),
  arch: z.literal(UPDATE_ARCH),
  electronVersion: z.string().min(1),
  dbSchemaVersion: z.number().int().min(0),
  minSourceDbSchemaVersion: z.number().int().min(0),
  createdAt: z.string().min(1),
  installer: z.object({
    fileName: safeInstallerFileNameSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive()
  }),
  sqliteNative: z.object({
    fileName: z.literal(PACKAGED_SQLITE_NATIVE_PATH),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive(),
    format: z.literal("pe32plus-x64")
  })
});

export type UpdatePackageManifest = z.infer<typeof updatePackageManifestSchema>;

export interface ValidatedUpdatePackage {
  packagePath: string;
  packageFileName: string;
  manifest: UpdatePackageManifest;
  installerBytes: Buffer;
  sqliteNativeBytes: Buffer;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateWindowsX64NativeModule(bytes: Buffer): void {
  if (bytes.length < 0x40 || bytes.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("SQLite native binary is not a Windows PE file");
  }
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset + 6 > bytes.length || bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error("SQLite native binary has invalid PE header");
  }
  const machine = bytes.readUInt16LE(peOffset + 4);
  if (machine !== 0x8664) {
    throw new Error("SQLite native binary is not Windows x64");
  }
  if (peOffset + 26 > bytes.length || bytes.readUInt16LE(peOffset + 24) !== 0x20b) {
    throw new Error("SQLite native binary is not PE32+");
  }
}

export function validateUpdatePackage(packagePath: string, currentDbSchemaVersion: number): ValidatedUpdatePackage {
  if (!packagePath.endsWith(".gpos-update.zip")) throw new Error("Choose a .gpos-update.zip package");
  const zip = new AdmZip(packagePath);
  const manifestEntry = zip.getEntry(UPDATE_PACKAGE_MANIFEST);
  if (!manifestEntry) throw new Error("Update package is missing gpos-update.json");
  const manifest = updatePackageManifestSchema.parse(JSON.parse(manifestEntry.getData().toString("utf8")));
  if (currentDbSchemaVersion < manifest.minSourceDbSchemaVersion) {
    throw new Error(`Update requires DB schema ${manifest.minSourceDbSchemaVersion}, current DB schema is ${currentDbSchemaVersion}`);
  }
  if (manifest.dbSchemaVersion < currentDbSchemaVersion) {
    throw new Error(`Update DB schema ${manifest.dbSchemaVersion} is older than current DB schema ${currentDbSchemaVersion}`);
  }

  const installerEntry = zip.getEntry(manifest.installer.fileName);
  if (!installerEntry) throw new Error("Update package is missing installer");
	  const installerBytes = installerEntry.getData();
	  if (installerBytes.length !== manifest.installer.sizeBytes || sha256(installerBytes) !== manifest.installer.sha256) {
	    throw new Error("Installer checksum mismatch");
	  }
	  if (installerBytes.length < 2 || installerBytes.toString("ascii", 0, 2) !== "MZ") {
	    throw new Error("Installer is not a Windows executable");
	  }

  const sqliteEntry = zip.getEntry(manifest.sqliteNative.fileName);
  if (!sqliteEntry) throw new Error("Update package is missing packaged SQLite native binary");
  const sqliteNativeBytes = sqliteEntry.getData();
  if (sqliteNativeBytes.length !== manifest.sqliteNative.sizeBytes || sha256(sqliteNativeBytes) !== manifest.sqliteNative.sha256) {
    throw new Error("SQLite native binary checksum mismatch");
  }
  validateWindowsX64NativeModule(sqliteNativeBytes);
  validateInstallerContainsSQLiteNative(installerBytes, manifest.sqliteNative.sha256);

  return {
    packagePath,
    packageFileName: basename(packagePath),
    manifest,
    installerBytes,
    sqliteNativeBytes
  };
}

export function validateInstallerContainsSQLiteNative(installerBytes: Buffer, expectedSha256: string): void {
  if (!path7za || !existsSync(path7za)) {
    throw new Error("Cannot inspect installer contents because bundled 7-Zip is missing");
  }
  const root = mkdtempSync(join(tmpdir(), "gpos-installer-check-"));
  try {
    const installerPath = join(root, "installer.exe");
    const extractRoot = join(root, "extract");
    writeFileSync(installerPath, installerBytes);
    extractArchive(installerPath, extractRoot);
    const embeddedNative = readDirectEmbeddedSQLiteNative(extractRoot);
    if (!embeddedNative) throw new Error("Installer does not contain packaged SQLite native binary");
    if (sha256(embeddedNative) !== expectedSha256) throw new Error("Installer SQLite native binary does not match manifest");
    validateWindowsX64NativeModule(embeddedNative);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function readDirectEmbeddedSQLiteNative(root: string): Buffer | null {
  const nativePath = join(root, ...INSTALLER_SQLITE_NATIVE_SUFFIX.split("/"));
  if (!existsSync(nativePath)) return null;
  return readFileSync(nativePath);
}

function extractArchive(archivePath: string, destination: string): void {
  const result = spawnSync(path7za!, ["x", archivePath, `-o${destination}`, "-y"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Could not inspect installer contents${detail ? `: ${detail}` : ""}`);
  }
}
