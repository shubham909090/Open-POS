import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(mobileRoot, "..", "..");
const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log([
    "Create a fresh local Android APK.",
    "",
    "Usage:",
    "  pnpm release:local-apk [--version x.y.z] [--version-code n] [--skip-typecheck]",
    "",
    "Defaults:",
    "  --version is optional; without it, the patch version is bumped automatically.",
    "  --version-code is optional; without it, the Android versionCode is incremented.",
    "  The script reuses .agent/tools/jdk-17 and .agent/android-sdk, installing them only if missing."
  ].join("\n"));
  process.exit(0);
}
const explicitVersion = readArg("--version");
const explicitVersionCode = readArg("--version-code");
const skipTypecheck = args.has("--skip-typecheck");
const packageJsonPath = join(mobileRoot, "package.json");
const appJsonPath = join(mobileRoot, "app.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
const appJson = JSON.parse(readFileSync(appJsonPath, "utf8")) as { expo: { version: string; android?: { versionCode?: number } } };
const oldVersion = appJson.expo.version;
const nextVersion = explicitVersion ?? bumpPatch(oldVersion);
const nextVersionCode = explicitVersionCode ? Number(explicitVersionCode) : Number(appJson.expo.android?.versionCode ?? 0) + 1;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  throw new Error(`Invalid version: ${nextVersion}`);
}
if (!Number.isInteger(nextVersionCode) || nextVersionCode <= 0) {
  throw new Error(`Invalid Android versionCode: ${explicitVersionCode}`);
}

packageJson.version = nextVersion;
appJson.expo.version = nextVersion;
appJson.expo.android = { ...(appJson.expo.android ?? {}), versionCode: nextVersionCode };
writeJson(packageJsonPath, packageJson);
writeJson(appJsonPath, appJson);

const env = ensureAndroidToolchain();

if (!skipTypecheck) {
  run("pnpm", ["typecheck"], { cwd: mobileRoot, env });
}

const releaseDir = join(mobileRoot, "release-local");
const apkName = `Gaurav POS Mobile-${nextVersion}.apk`;
const apkPath = join(releaseDir, apkName);
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

run(
  "pnpm",
  ["dlx", "eas-cli@18.11.0", "build", "--platform", "android", "--profile", "preview", "--local", "--non-interactive", "--output", join("release-local", apkName)],
  { cwd: mobileRoot, env }
);

if (!existsSync(apkPath)) throw new Error(`APK missing after build: ${apkPath}`);
verifyApk(apkPath, env);

console.log("");
console.log("Fresh Android APK created:");
console.log(`- ${apkPath}`);
console.log(`- version: ${nextVersion}`);
console.log(`- versionCode: ${nextVersionCode}`);
console.log("");
console.log("SHA-256:");
console.log(`${sha256(readFileSync(apkPath))}  ${apkName}`);

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

function ensureAndroidToolchain(): NodeJS.ProcessEnv {
  const javaHome = join(repoRoot, ".agent", "tools", "jdk-17");
  const androidHome = join(repoRoot, ".agent", "android-sdk");
  const sdkManager = join(androidHome, "cmdline-tools", "latest", "bin", process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager");

  if (!existsSync(join(javaHome, "bin", "java"))) {
    installJdk(javaHome);
  }
  if (!existsSync(sdkManager)) {
    installAndroidCommandLineTools(androidHome);
  }

  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    PATH: [
      join(javaHome, "bin"),
      join(androidHome, "cmdline-tools", "latest", "bin"),
      join(androidHome, "platform-tools"),
      process.env.PATH ?? ""
    ].join(":")
  };

  run(sdkManager, ["--licenses"], { cwd: repoRoot, env, input: "y\ny\ny\ny\ny\ny\ny\ny\ny\ny\n" });
  run(sdkManager, ["platform-tools", "platforms;android-36", "build-tools;36.0.0"], { cwd: repoRoot, env });
  return env;
}

function installJdk(javaHome: string): void {
  if (process.platform !== "darwin") throw new Error("Automatic JDK install is only implemented for macOS; install JDK 17 and rerun.");
  const arch = process.arch === "arm64" ? "aarch64" : "x64";
  const temp = join(repoRoot, ".agent", "tmp", "jdk-install");
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true });
  const tarPath = join(temp, "jdk.tar.gz");
  run("curl", ["-fL", `https://api.adoptium.net/v3/binary/latest/17/ga/mac/${arch}/jdk/hotspot/normal/eclipse`, "-o", tarPath], { cwd: repoRoot });
  run("tar", ["-xzf", tarPath, "-C", temp], { cwd: repoRoot });
  const contents = findDirectory(temp, "Contents");
  if (!contents) throw new Error("Downloaded JDK did not contain Contents/Home");
  rmSync(javaHome, { recursive: true, force: true });
  mkdirSync(javaHome, { recursive: true });
  run("cp", ["-R", `${join(contents, "Home")}/.`, javaHome], { cwd: repoRoot });
}

function installAndroidCommandLineTools(androidHome: string): void {
  if (process.platform !== "darwin") throw new Error("Automatic Android SDK install is only implemented for macOS; install Android command-line tools and rerun.");
  const temp = join(repoRoot, ".agent", "tmp", "android-tools-install");
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true });
  const zipPath = join(temp, "cmdline-tools.zip");
  run("curl", ["-fL", "https://dl.google.com/android/repository/commandlinetools-mac-13114758_latest.zip", "-o", zipPath], { cwd: repoRoot });
  run("unzip", ["-q", zipPath, "-d", temp], { cwd: repoRoot });
  const destination = join(androidHome, "cmdline-tools", "latest");
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  run("cp", ["-R", `${join(temp, "cmdline-tools")}/.`, destination], { cwd: repoRoot });
}

function verifyApk(apkPath: string, env: NodeJS.ProcessEnv): void {
  const apksigner = join(env.ANDROID_HOME!, "build-tools", "36.0.0", process.platform === "win32" ? "apksigner.bat" : "apksigner");
  run(apksigner, ["verify", "--verbose", apkPath], { cwd: repoRoot, env });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function findDirectory(root: string, name: string): string | null {
  const result = spawnSync("find", [root, "-type", "d", "-name", name], { encoding: "utf8" });
  return result.stdout.split(/\r?\n/).find(Boolean) ?? null;
}

function run(command: string, commandArgs: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {}): void {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? mobileRoot,
    env: options.env ?? process.env,
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} failed`);
}
