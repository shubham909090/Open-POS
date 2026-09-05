import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const java = process.env.JAVA_HOME || resolve(repo, '.agent/tools/jdk-17');
const sdk = process.env.ANDROID_HOME || resolve(process.env.HOME, 'Library/Android/sdk');
if (!existsSync(resolve(java, 'bin/java'))) throw new Error('Set JAVA_HOME to JDK 17 or newer.');
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const signingDir = resolve(repo, '.agent/attendance-signing');
mkdirSync(signingDir, { recursive: true, mode: 0o700 });
const credentialsPath = resolve(signingDir, 'credentials.json');
const keystorePath = resolve(signingDir, 'release.jks');
if (!existsSync(credentialsPath)) {
  if (existsSync(keystorePath)) throw new Error('Signing credentials missing. Restore the original credentials before rebuilding.');
  writeFileSync(credentialsPath, JSON.stringify({ password: randomBytes(32).toString('hex') }), { mode: 0o600 });
}
const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
env.SKY_ATTENDANCE_KEYSTORE = keystorePath;
env.SKY_ATTENDANCE_KEY_PASSWORD = credentials.password;
if (!existsSync(keystorePath)) {
  run(resolve(java, 'bin/keytool'), ['-genkeypair', '-keystore', keystorePath, '-alias', 'skyattendance', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-storepass:env', 'SKY_ATTENDANCE_KEY_PASSWORD', '-keypass:env', 'SKY_ATTENDANCE_KEY_PASSWORD', '-dname', 'CN=Sky Attendance, O=Sky Lounge, C=IN']);
}
run('pnpm', ['typecheck']);
run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install']);
const gradlePath = resolve(root, 'android/app/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
if (!gradle.includes('skyAttendanceRelease {')) {
  gradle = gradle.replace('signingConfigs {', `signingConfigs {
        skyAttendanceRelease {
            storeFile file(System.getenv("SKY_ATTENDANCE_KEYSTORE"))
            storePassword System.getenv("SKY_ATTENDANCE_KEY_PASSWORD")
            keyAlias "skyattendance"
            keyPassword System.getenv("SKY_ATTENDANCE_KEY_PASSWORD")
        }`);
}
gradle = gradle.replace(/(release \{[\s\S]*?signingConfig signingConfigs\.)debug/, '$1skyAttendanceRelease');
if (!gradle.includes('signingConfig signingConfigs.skyAttendanceRelease')) throw new Error('Release signing configuration was not applied.');
writeFileSync(gradlePath, gradle);
run('./gradlew', ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--max-workers=2', '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m'], resolve(root, 'android'));
mkdirSync(resolve(root, 'release'), { recursive: true });
copyFileSync(resolve(root, 'android/app/build/outputs/apk/release/app-release.apk'), resolve(root, 'release/Sky-Attendance-1.0.0.apk'));
console.log('APK: ' + resolve(root, 'release/Sky-Attendance-1.0.0.apk'));
