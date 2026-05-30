import AdmZip from "adm-zip";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentDbSchemaVersion } from "../src/db/schema-version.js";
import { readAppMetadata } from "../src/app-metadata.js";
import {
  ONLINE_UPDATE_METADATA,
  PACKAGED_SQLITE_NATIVE_PATH,
  UPDATE_APP_ID,
  sha256,
  validateInstallerContainsSQLiteNative,
  validateUpdatePackage,
  validateWindowsX64NativeModule,
  type UpdatePackageManifest
} from "../src/update/update-package.js";

const require = createRequire(import.meta.url);
const hubRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(hubRoot, "..", "..");
const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log([
    "Create a fresh Hub Windows release.",
    "",
    "Usage:",
    "  pnpm release:fresh-windows [--version x.y.z] [--skip-tests] [--publish]",
    "",
    "Defaults:",
    "  --version is optional; without it, the patch version is bumped automatically.",
    "  On macOS, the script repairs the cross-built SQLite native to Windows x64 PE32+ before creating the update zip.",
    "  --publish runs release:github after local validation."
  ].join("\n"));
  process.exit(0);
}
const explicitVersion = readArg("--version");
const skipTests = args.has("--skip-tests");
const publish = args.has("--publish");
const packageJsonPath = join(hubRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string; build?: { productName?: string }; devDependencies?: { electron?: string } };
const oldVersion = packageJson.version;
const nextVersion = explicitVersion ?? bumpPatch(oldVersion);

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  throw new Error(`Invalid version: ${nextVersion}`);
}

if (nextVersion !== oldVersion) {
  packageJson.version = nextVersion;
  writeJson(packageJsonPath, packageJson);
  replaceInFile(join(repoRoot, "docs", "release-build-workflow.md"), oldVersion, nextVersion);
}

if (!skipTests) {
  run("pnpm", ["test"]);
  run("pnpm", ["typecheck"]);
}

rmSync(join(hubRoot, "release"), { recursive: true, force: true });

if (process.platform === "win32") {
  run("pnpm", ["package:update"]);
} else {
  run("pnpm", ["package:win"]);
  repairCrossBuiltWindowsSqlite();
  rebuildInstallerFromUnpacked();
  createUpdatePackage();
}

validatePreloadBridge();
createCleanReleaseFolder();
const manifest = validateFinalPackage();
const installerName = `${manifest.productName} Setup ${manifest.version}.exe`;
const installerBlockmapName = `${installerName}.blockmap`;
const packageName = `${manifest.productName}-${manifest.version}.gpos-update.zip`;
const installerPath = join(hubRoot, "release", installerName);
const installerBlockmapPath = join(hubRoot, "release", installerBlockmapName);
const packagePath = join(hubRoot, "release", packageName);
const latestYmlPath = join(hubRoot, "release", "latest.yml");
const onlineMetadataPath = join(hubRoot, "release", ONLINE_UPDATE_METADATA);

console.log("");
console.log("Fresh Hub Windows release created:");
console.log(`- ${installerPath}`);
console.log(`- ${installerBlockmapPath}`);
console.log(`- ${latestYmlPath}`);
console.log(`- ${onlineMetadataPath}`);
console.log(`- ${packagePath}`);
console.log(`- DB schema: ${manifest.dbSchemaVersion}`);
console.log(`- SQLite native: ${manifest.sqliteNative.format}`);
console.log("");
console.log("SHA-256:");
console.log(`${sha256(readFileSync(installerPath))}  ${installerName}`);
console.log(`${sha256(readFileSync(installerBlockmapPath))}  ${installerBlockmapName}`);
console.log(`${sha256(readFileSync(latestYmlPath))}  latest.yml`);
console.log(`${sha256(readFileSync(onlineMetadataPath))}  ${ONLINE_UPDATE_METADATA}`);
console.log(`${sha256(readFileSync(packagePath))}  ${packageName}`);

if (publish) {
  run("pnpm", ["release:github", "--", "--dry-run"]);
  run("pnpm", ["release:github"]);
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function bumpPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!match) throw new Error(`Cannot auto-bump version ${version}; pass --version x.y.z`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}${match[4]}`;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceInFile(path: string, from: string, to: string): void {
  if (!existsSync(path)) return;
  writeFileSync(path, readFileSync(path, "utf8").split(from).join(to));
}

function run(command: string, commandArgs: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? hubRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} failed`);
}

function repairCrossBuiltWindowsSqlite(): void {
  const metadata = readAppMetadata();
  const nativePath = packagedSqliteNativePath();
  const nativeBytes = readFileSync(nativePath);
  try {
    validateWindowsX64NativeModule(nativeBytes);
    removeTestNative();
    return;
  } catch {
    // macOS cross-builds usually place a Mach-O native here. Replace it with the
    // Electron win32-x64 prebuild before rebuilding the installer.
  }

  const tempRoot = join(repoRoot, ".agent", "tmp", "better-sqlite3-electron-win32-x64");
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });
  const betterSqlitePackage = require.resolve("better-sqlite3/package.json");
  cpSync(betterSqlitePackage, join(tempRoot, "package.json"));
  const prebuildInstall = join(repoRoot, "node_modules", ".pnpm", "node_modules", ".bin", process.platform === "win32" ? "prebuild-install.cmd" : "prebuild-install");
  run(prebuildInstall, ["--runtime", "electron", "--target", metadata.electronVersion, "--platform", "win32", "--arch", "x64", "--verbose"], { cwd: tempRoot });
  cpSync(join(tempRoot, "build", "Release", "better_sqlite3.node"), nativePath);
  removeTestNative();
  validateWindowsX64NativeModule(readFileSync(nativePath));
}

function removeTestNative(): void {
  rmSync(join(hubRoot, "release", "win-unpacked", "resources", "app.asar.unpacked", "node_modules", "better-sqlite3", "build", "Release", "test_extension.node"), {
    force: true
  });
}

function rebuildInstallerFromUnpacked(): void {
  const metadata = readAppMetadata();
  rmSync(join(hubRoot, "release", `${metadata.productName} Setup ${metadata.version}.exe`), { force: true });
  rmSync(join(hubRoot, "release", `${metadata.productName} Setup ${metadata.version}.exe.blockmap`), { force: true });
  rmSync(join(hubRoot, "release", "builder-debug.yml"), { force: true });
  run("pnpm", ["exec", "electron-builder", "--win", "nsis", "--x64", "--prepackaged", "release/win-unpacked"]);
}

function createUpdatePackage(): void {
  const metadata = readAppMetadata();
  if (metadata.appId !== UPDATE_APP_ID) throw new Error(`Unexpected appId ${metadata.appId}`);
  const releaseDir = join(hubRoot, "release");
  const installerName = `${metadata.productName} Setup ${metadata.version}.exe`;
  const installerPath = join(releaseDir, installerName);
  const nativePath = packagedSqliteNativePath();
  const packagePath = join(releaseDir, `${metadata.productName}-${metadata.version}.gpos-update.zip`);
  const nativeBytes = readFileSync(nativePath);
  validateWindowsX64NativeModule(nativeBytes);
  const installerBytes = readFileSync(installerPath);
  validateInstallerContainsSQLiteNative(installerBytes, sha256(nativeBytes));
  const manifest: UpdatePackageManifest = {
    schemaVersion: 1,
    appId: UPDATE_APP_ID,
    productName: metadata.productName,
    version: metadata.version,
    platform: "win32",
    arch: "x64",
    electronVersion: metadata.electronVersion,
    dbSchemaVersion: currentDbSchemaVersion(),
    minSourceDbSchemaVersion: 0,
    createdAt: new Date().toISOString(),
    installer: { fileName: installerName, sha256: sha256(installerBytes), sizeBytes: statSync(installerPath).size },
    sqliteNative: { fileName: PACKAGED_SQLITE_NATIVE_PATH, sha256: sha256(nativeBytes), sizeBytes: statSync(nativePath).size, format: "pe32plus-x64" }
  };
  writeFileSync(join(releaseDir, ONLINE_UPDATE_METADATA), JSON.stringify(toOnlineMetadata(manifest), null, 2));
  const zip = new AdmZip();
  zip.addFile("gpos-update.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
  zip.addFile(installerName, installerBytes);
  zip.addFile(manifest.sqliteNative.fileName, nativeBytes);
  zip.writeZip(packagePath);
}

function packagedSqliteNativePath(): string {
  return join(hubRoot, "release", PACKAGED_SQLITE_NATIVE_PATH);
}

function validatePreloadBridge(): void {
  const asarBin = join(repoRoot, "node_modules", ".pnpm", "node_modules", "@electron", "asar", "bin", "asar.js");
  const appAsar = join(hubRoot, "release", "win-unpacked", "resources", "app.asar");
  const result = spawnSync(process.execPath, [asarBin, "list", appAsar], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Could not inspect app.asar");
  const entries = new Set(result.stdout.split(/\r?\n/).filter(Boolean));
  for (const entry of ["/dist/electron.js", "/preload.cjs"]) {
    if (!entries.has(entry)) throw new Error(`Packaged app is missing ${entry}`);
  }
}

function createCleanReleaseFolder(): void {
  const metadata = readAppMetadata();
  const installerName = `${metadata.productName} Setup ${metadata.version}.exe`;
  const keep = new Set([
    installerName,
    `${installerName}.blockmap`,
    "latest.yml",
    ONLINE_UPDATE_METADATA,
    `${metadata.productName}-${metadata.version}.gpos-update.zip`
  ]);
  const releaseDir = join(hubRoot, "release");
  for (const name of require("node:fs").readdirSync(releaseDir) as string[]) {
    if (!keep.has(name)) rmSync(join(releaseDir, name), { recursive: true, force: true });
  }
  for (const name of keep) {
    const path = join(releaseDir, name);
    if (!existsSync(path)) throw new Error(`Required release file missing: ${path}`);
  }
}

function validateFinalPackage(): UpdatePackageManifest {
  const metadata = readAppMetadata();
  const packagePath = join(hubRoot, "release", `${metadata.productName}-${metadata.version}.gpos-update.zip`);
  const manifest = validateUpdatePackage(packagePath, currentDbSchemaVersion()).manifest;
  const onlineMetadata = JSON.parse(readFileSync(join(hubRoot, "release", ONLINE_UPDATE_METADATA), "utf8")) as Record<string, unknown>;
  for (const key of ["schemaVersion", "appId", "productName", "version", "platform", "arch", "dbSchemaVersion", "minSourceDbSchemaVersion"]) {
    if (onlineMetadata[key] !== (manifest as unknown as Record<string, unknown>)[key]) throw new Error(`${ONLINE_UPDATE_METADATA} does not match package manifest field ${key}`);
  }
  return manifest;
}

function toOnlineMetadata(manifest: UpdatePackageManifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    appId: manifest.appId,
    productName: manifest.productName,
    version: manifest.version,
    platform: manifest.platform,
    arch: manifest.arch,
    dbSchemaVersion: manifest.dbSchemaVersion,
    minSourceDbSchemaVersion: manifest.minSourceDbSchemaVersion,
    createdAt: manifest.createdAt
  };
}
