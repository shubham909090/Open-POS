import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { currentDbSchemaVersion } from "../src/db/schema-version.js";
import { readAppMetadata } from "../src/app-metadata.js";
import { validateUpdatePackage } from "../src/update/update-package.js";

const owner = "shubham909090";
const repo = "Open-POS";
const root = process.cwd();
const releaseDir = join(root, "release");
const metadata = readAppMetadata();
const version = metadata.version;
const tag = `hub-v${version}`;
const installerName = `${metadata.productName} Setup ${version}.exe`;
const packageName = `${metadata.productName}-${version}.gpos-update.zip`;
const installerPath = join(releaseDir, installerName);
const packagePath = join(releaseDir, packageName);
const mobilePackagePath = join(root, "..", "mobile", "package.json");
const mobileVersion = existsSync(mobilePackagePath)
  ? (JSON.parse(readFileSync(mobilePackagePath, "utf8")).version as string)
  : null;
const mobileApkName = mobileVersion ? `Gaurav POS Mobile-${mobileVersion}.apk` : null;
const mobileApkPath = mobileApkName ? join(root, "..", "mobile", "release-local", mobileApkName) : null;
const releaseAssets = [packagePath, installerPath, ...(mobileApkPath && existsSync(mobileApkPath) ? [mobileApkPath] : [])];
const dryRun = process.argv.includes("--dry-run");
const clobber = process.argv.includes("--clobber");

if (!existsSync(installerPath)) throw new Error(`Missing installer: ${installerPath}`);
if (!existsSync(packagePath)) throw new Error(`Missing update package: ${packagePath}`);

const releaseFiles = readdirSync(releaseDir).filter((name) => !name.startsWith("."));
const unexpected = releaseFiles.filter((name) => name !== installerName && name !== packageName);
if (unexpected.length) {
  throw new Error(`Release folder contains stale files: ${unexpected.join(", ")}. Clean it before publishing.`);
}

const validated = validateUpdatePackage(packagePath, currentDbSchemaVersion());
if (validated.manifest.version !== version) throw new Error(`Package version ${validated.manifest.version} does not match app version ${version}`);
if (validated.manifest.installer.fileName !== installerName) throw new Error(`Manifest installer ${validated.manifest.installer.fileName} does not match ${installerName}`);

const notes = [
  `Gaurav POS Hub ${version}`,
  "",
  "Assets:",
  `- ${packageName} (in-app update package)`,
  `- ${installerName} (first-time install / manual reinstall)`,
  ...(mobileApkName && mobileApkPath && existsSync(mobileApkPath) ? [`- ${mobileApkName} (Android APK)`] : []),
  "",
  "Update safety:",
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

function run(command: string, args: string[], options: { allowFailure?: boolean } = {}): boolean {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status === 0) return true;
  if (options.allowFailure) return false;
  throw new Error(`${command} ${args.join(" ")} failed`);
}
