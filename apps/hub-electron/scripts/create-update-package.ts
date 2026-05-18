import AdmZip from "adm-zip";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { currentDbSchemaVersion } from "../src/db/schema-version.js";
import { readAppMetadata } from "../src/app-metadata.js";
import { PACKAGED_SQLITE_NATIVE_PATH, UPDATE_APP_ID, sha256, validateInstallerContainsSQLiteNative, validateWindowsX64NativeModule, type UpdatePackageManifest } from "../src/update/update-package.js";

const root = process.cwd();
const releaseDir = join(root, "release");
const metadata = readAppMetadata();
if (metadata.appId !== UPDATE_APP_ID) throw new Error(`Unexpected appId ${metadata.appId}`);
const productName = metadata.productName;
const installerName = `${productName} Setup ${metadata.version}.exe`;
const installerPath = join(releaseDir, installerName);
const unpackedExePath = join(releaseDir, "win-unpacked", `${productName}.exe`);
const sqliteNativePath = join(
  releaseDir,
  "win-unpacked",
  "resources",
  "app.asar.unpacked",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
const packagePath = join(releaseDir, `${productName}-${metadata.version}.gpos-update.zip`);

run("pnpm", ["build"]);
run("electron-builder", ["--win", "nsis", "--x64"]);

for (const path of [installerPath, unpackedExePath, sqliteNativePath]) {
  if (!existsSync(path)) throw new Error(`Required release file missing: ${path}`);
}

const sqliteBytes = readFileSync(sqliteNativePath);
validateWindowsX64NativeModule(sqliteBytes);

if (process.platform !== "win32") {
  throw new Error(
    [
      "Windows packaged SQLite self-test cannot run on this OS.",
      "Create release packages on Windows CI/laptop.",
      "No .gpos-update.zip created."
    ].join(" ")
  );
}

if (process.platform === "win32") {
  const selfTest = spawnSync(unpackedExePath, ["--self-test-sqlite"], { stdio: "inherit" });
  if (selfTest.status !== 0) throw new Error("Packaged SQLite self-test failed");
}

const installerBytes = readFileSync(installerPath);
const dbSchemaVersion = currentDbSchemaVersion();
validateInstallerContainsSQLiteNative(installerBytes, sha256(sqliteBytes));
const manifest: UpdatePackageManifest = {
  schemaVersion: 1,
  appId: UPDATE_APP_ID,
  productName,
  version: metadata.version,
  platform: "win32",
  arch: "x64",
  electronVersion: metadata.electronVersion,
  dbSchemaVersion,
  minSourceDbSchemaVersion: 0,
  createdAt: new Date().toISOString(),
  installer: {
    fileName: installerName,
    sha256: sha256(installerBytes),
    sizeBytes: statSync(installerPath).size
  },
  sqliteNative: {
    fileName: PACKAGED_SQLITE_NATIVE_PATH,
    sha256: sha256(sqliteBytes),
    sizeBytes: statSync(sqliteNativePath).size,
    format: "pe32plus-x64"
  }
};

const zip = new AdmZip();
zip.addFile("gpos-update.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
zip.addFile(installerName, installerBytes);
zip.addFile(manifest.sqliteNative.fileName, sqliteBytes);
zip.writeZip(packagePath);
console.log(`Created ${packagePath}`);

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}
