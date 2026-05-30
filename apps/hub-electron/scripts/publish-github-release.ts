import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { currentDbSchemaVersion } from "../src/db/schema-version.js";
import { readAppMetadata } from "../src/app-metadata.js";
import { ONLINE_UPDATE_METADATA, validateOnlineUpdateMetadata, validateUpdatePackage } from "../src/update/update-package.js";

const owner = "shubham909090";
const repo = "Open-POS";
const root = process.cwd();
const releaseDir = join(root, "release");
const metadata = readAppMetadata();
const version = metadata.version;
const tag = `hub-v${version}`;
const installerName = `${metadata.productName} Setup ${version}.exe`;
const installerBlockmapName = `${installerName}.blockmap`;
const packageName = `${metadata.productName}-${version}.gpos-update.zip`;
const installerPath = join(releaseDir, installerName);
const installerBlockmapPath = join(releaseDir, installerBlockmapName);
const packagePath = join(releaseDir, packageName);
const latestYmlPath = join(releaseDir, "latest.yml");
const onlineMetadataPath = join(releaseDir, ONLINE_UPDATE_METADATA);
const latestYml = readFileSync(latestYmlPath, "utf8");
const updaterInstallerName = readLatestYmlPath(latestYml);
const updaterInstallerBlockmapName = `${updaterInstallerName}.blockmap`;
const uploadAliasDir = mkdtempSync(join(tmpdir(), "gpos-release-assets-"));
const updaterInstallerPath = join(uploadAliasDir, updaterInstallerName);
const updaterInstallerBlockmapPath = join(uploadAliasDir, updaterInstallerBlockmapName);
const mobilePackagePath = join(root, "..", "mobile", "package.json");
const mobileVersion = existsSync(mobilePackagePath)
  ? (JSON.parse(readFileSync(mobilePackagePath, "utf8")).version as string)
  : null;
const mobileApkName = mobileVersion ? `Gaurav POS Mobile-${mobileVersion}.apk` : null;
const mobileApkPath = mobileApkName ? join(root, "..", "mobile", "release-local", mobileApkName) : null;
copyFileSync(installerPath, updaterInstallerPath);
copyFileSync(installerBlockmapPath, updaterInstallerBlockmapPath);
const releaseAssets = [updaterInstallerPath, updaterInstallerBlockmapPath, latestYmlPath, onlineMetadataPath, packagePath, ...(mobileApkPath && existsSync(mobileApkPath) ? [mobileApkPath] : [])];
const dryRun = process.argv.includes("--dry-run");
const clobber = process.argv.includes("--clobber");

if (!existsSync(installerPath)) throw new Error(`Missing installer: ${installerPath}`);
if (!existsSync(installerBlockmapPath)) throw new Error(`Missing installer blockmap: ${installerBlockmapPath}`);
if (!existsSync(latestYmlPath)) throw new Error(`Missing updater metadata: ${latestYmlPath}`);
if (!existsSync(onlineMetadataPath)) throw new Error(`Missing online DB compatibility metadata: ${onlineMetadataPath}`);
if (!existsSync(packagePath)) throw new Error(`Missing update package: ${packagePath}`);

const releaseFiles = readdirSync(releaseDir).filter((name) => !name.startsWith("."));
const expectedReleaseFiles = new Set([installerName, installerBlockmapName, "latest.yml", ONLINE_UPDATE_METADATA, packageName]);
const unexpected = releaseFiles.filter((name) => !expectedReleaseFiles.has(name));
if (unexpected.length) {
  throw new Error(`Release folder contains stale files: ${unexpected.join(", ")}. Clean it before publishing.`);
}

const validated = validateUpdatePackage(packagePath, currentDbSchemaVersion());
if (validated.manifest.version !== version) throw new Error(`Package version ${validated.manifest.version} does not match app version ${version}`);
if (validated.manifest.installer.fileName !== installerName) throw new Error(`Manifest installer ${validated.manifest.installer.fileName} does not match ${installerName}`);
const onlineMetadata = validateOnlineUpdateMetadata(JSON.parse(readFileSync(onlineMetadataPath, "utf8")), currentDbSchemaVersion(), version);
if (onlineMetadata.dbSchemaVersion !== validated.manifest.dbSchemaVersion || onlineMetadata.minSourceDbSchemaVersion !== validated.manifest.minSourceDbSchemaVersion) {
  throw new Error(`${ONLINE_UPDATE_METADATA} DB compatibility fields do not match ${packageName}`);
}

const notes = [
  `Gaurav POS Hub ${version}`,
  "",
  "Assets:",
  `- ${updaterInstallerName} (one-click Windows updater / first-time install)`,
  `- ${updaterInstallerBlockmapName} (Electron updater differential metadata)`,
  "- latest.yml (Electron updater channel metadata)",
  `- ${ONLINE_UPDATE_METADATA} (Hub DB compatibility metadata)`,
  `- ${packageName} (fallback DB-safe update package)`,
  ...(mobileApkName && mobileApkPath && existsSync(mobileApkPath) ? [`- ${mobileApkName} (Android APK)`] : []),
  "",
  "Update safety:",
  "- Hub online updater creates a pre-update DB backup before install",
  "- DB schema compatibility checked by Hub before install",
  "- SQLite native binary validated as Windows x64 PE32+",
  "- Installer inspected for matching SQLite native binary",
  "- Hub creates pre-update DB backup before opening installer",
  ...(mobileApkName && mobileApkPath && existsSync(mobileApkPath) ? ["- Android APK built with EAS preview profile"] : [])
].join("\n");

console.log(`Ready to publish ${owner}/${repo} ${tag}`);
for (const asset of releaseAssets) console.log(`- ${asset}`);
if (dryRun) {
  console.log("Dry run only. No GitHub release created.");
  rmSync(uploadAliasDir, { recursive: true, force: true });
  process.exit(0);
}

if (run("gh", ["release", "view", tag, "--repo", `${owner}/${repo}`], { allowFailure: true })) {
  if (!clobber) {
    throw new Error(`Release ${tag} already exists. Bump app version or rerun with --clobber for an intentional overwrite.`);
  }
  run("gh", ["release", "edit", tag, "--repo", `${owner}/${repo}`, "--title", `Hub ${version}`, "--notes", notes]);
  run("gh", ["release", "upload", tag, ...releaseAssets, "--repo", `${owner}/${repo}`, "--clobber"]);
} else {
  run("gh", [
      "release",
      "create",
      tag,
      ...releaseAssets,
      "--repo",
      `${owner}/${repo}`,
      "--title",
      `Hub ${version}`,
      "--notes",
      notes
    ]);
}
rmSync(uploadAliasDir, { recursive: true, force: true });

function run(command: string, args: string[], options: { allowFailure?: boolean } = {}): boolean {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status === 0) return true;
  if (options.allowFailure) return false;
  throw new Error(`${command} ${args.join(" ")} failed`);
}

function readLatestYmlPath(contents: string): string {
  const match = /^path:\s*['"]?([^'"\r\n]+)['"]?\s*$/m.exec(contents);
  if (!match) throw new Error("latest.yml is missing installer path");
  const value = match[1].trim();
  if (!value.endsWith(".exe") || value.includes("/") || value.includes("\\")) {
    throw new Error(`latest.yml installer path is not a plain .exe file name: ${value}`);
  }
  return value;
}
