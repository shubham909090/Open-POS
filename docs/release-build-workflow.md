# Release Build Workflow

This is the repeatable workflow for creating fresh Hub Windows builds and Android Expo builds.

Use this when preparing files for the restaurant.

## Output Files

After a clean release, the Hub release folder should contain only:

```text
apps/hub-electron/release/Gaurav POS Hub Setup 0.1.4.exe
apps/hub-electron/release/Gaurav POS Hub-0.1.4.gpos-update.zip
```

Use the `.exe` for first-time install.

Use the `.gpos-update.zip` for in-app updates.

## Important Rule

The trusted Hub release build must be created on Windows x64.

Reason: the package command must run the packaged Windows app with `--self-test-sqlite`. That proves the packaged `better-sqlite3` native binary actually loads inside the packaged Electron app.

If the build is attempted on macOS and the SQLite guard fails, do not use that package.

Also verify that the Electron preload bridge is packaged. The app update file picker depends on `/preload.cjs` being present inside `app.asar`. If it is missing, the App Updates screen will fall back to pasted paths instead of opening the native file picker.

## Fresh Build Definition

When someone asks for a "fresh Windows build", treat it as a full release regeneration, not just rerunning the last command.

Fresh means:

- bump `apps/hub-electron/package.json` to a new version before building
- bump `apps/mobile/package.json` and `apps/mobile/app.json` when also making an Android build
- update this workflow's example file names if the release version changes
- delete `apps/hub-electron/release` before starting the Hub build
- run tests and typechecks after the version bump
- regenerate the `.exe` and `.gpos-update.zip`
- verify the packaged SQLite native binary is Windows x64 `PE32+`
- verify the installer contains the same SQLite native binary hash recorded in the update manifest
- verify `/preload.cjs` exists inside `app.asar`
- clean the release folder so only the current `.exe` and `.gpos-update.zip` remain
- start a fresh EAS Android build with `--no-wait` when Android is requested

Do not ship a same-version update package over the previous installed app. The app update cache and rollback baseline are version-keyed, so a real update should move from something like `0.1.2` to `0.1.4`.

## Before Building

From the repo root:

```bash
pnpm install
pnpm --filter @gaurav-pos/hub-electron test
pnpm --filter @gaurav-pos/hub-electron typecheck
pnpm --filter @gaurav-pos/mobile typecheck
```

Only continue if tests and typecheck pass.

For a fresh build, also start from an empty Hub release folder:

```bash
rm -rf apps/hub-electron/release
```

## Build Hub Windows Release

Run this on Windows x64 from the repo root:

```bash
pnpm --filter @gaurav-pos/hub-electron package:update
```

This creates:

- the Windows NSIS installer `.exe`
- the update package `.gpos-update.zip`
- the update manifest
- SHA-256 checksums

The command must validate:

- app id is `in.gaurav.pos.hub`
- platform is `win32`
- arch is `x64`
- DB schema version is recorded
- SQLite native binary is Windows x64 `PE32+`
- installer contains the same SQLite native binary recorded in the manifest
- packaged app passes `--self-test-sqlite`

If any check fails, do not send the build.

## Mac Cross-Build Warning

macOS can produce a Windows `.exe`, but it may package the wrong SQLite native binary. We saw this happen: `better_sqlite3.node` inside `win-unpacked` was a macOS Mach-O file even though the app target was Windows.

For a trusted restaurant build, prefer Windows x64 and `package:update`.

If you must cross-build from macOS temporarily, do all of this before sending files:

1. Build the Windows app:

```bash
pnpm --filter @gaurav-pos/hub-electron package:win
```

2. Check the packaged SQLite native:

```bash
file "apps/hub-electron/release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
```

It must say something like:

```text
PE32+ executable (DLL) (GUI) x86-64, for MS Windows
```

If it says `Mach-O`, `ELF`, `arm64`, or anything non-Windows, stop. Do not use that installer.

3. Fetch the Electron Windows x64 prebuild for the exact Electron version and replace only `better_sqlite3.node`:

```bash
REPO_ROOT="$(pwd)"
rm -rf .agent/tmp/better-sqlite3-electron-win32-x64
mkdir -p .agent/tmp/better-sqlite3-electron-win32-x64
cp node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3/package.json .agent/tmp/better-sqlite3-electron-win32-x64/package.json
cd .agent/tmp/better-sqlite3-electron-win32-x64
"$REPO_ROOT/node_modules/.pnpm/node_modules/.bin/prebuild-install" --runtime electron --target 38.8.6 --platform win32 --arch x64 --verbose
cd "$REPO_ROOT"
cp .agent/tmp/better-sqlite3-electron-win32-x64/build/Release/better_sqlite3.node \
  apps/hub-electron/release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

4. Remove any non-Windows test `.node` files from the packaged app:

```bash
rm -f apps/hub-electron/release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/test_extension.node
find apps/hub-electron/release/win-unpacked -name "*.node" -print -exec file {} \;
```

Only `better_sqlite3.node` should remain, and it must be Windows x64 `PE32+`.

5. Rebuild the installer from corrected `win-unpacked`:

```bash
rm -f "apps/hub-electron/release/Gaurav POS Hub Setup 0.1.4.exe" \
  "apps/hub-electron/release/Gaurav POS Hub Setup 0.1.4.exe.blockmap" \
  apps/hub-electron/release/builder-debug.yml
pnpm --filter @gaurav-pos/hub-electron exec electron-builder --win nsis --x64 --prepackaged release/win-unpacked
```

6. Create the `.gpos-update.zip` only after the native binary passes validation.

On macOS cross-builds, `package:update` intentionally stops before creating the update zip if the packaged SQLite native is not Windows `PE32+` or if the Windows self-test cannot run. If you repair the native binary manually as above, create the update zip only after all of these pass:

```bash
node_modules/.pnpm/node_modules/@electron/asar/bin/asar.js list \
  "apps/hub-electron/release/win-unpacked/resources/app.asar" | rg "^/preload\\.cjs$|^/dist/electron\\.js$"

pnpm --filter @gaurav-pos/hub-electron exec tsx -e "import { readFileSync } from 'node:fs'; import { validateInstallerContainsSQLiteNative, validateWindowsX64NativeModule, sha256 } from './src/update/update-package.ts'; const native=readFileSync('./release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'); validateWindowsX64NativeModule(native); validateInstallerContainsSQLiteNative(readFileSync('./release/Gaurav POS Hub Setup 0.1.4.exe'), sha256(native)); console.log({ sqliteNativeSha256: sha256(native) });"
```

Then create the zip using the app's update manifest format and immediately run the final validator below. If this feels clumsy, stop and build on Windows x64 instead.

## Preload Picker Validation

The packaged app must contain the CommonJS preload bridge:

```bash
node_modules/.pnpm/node_modules/@electron/asar/bin/asar.js list \
  "apps/hub-electron/release/win-unpacked/resources/app.asar" | rg "^/preload\\.cjs$|^/dist/electron\\.js$"
```

Expected:

```text
/dist/electron.js
/preload.cjs
```

On macOS, you can build a local test app and verify the renderer bridge:

```bash
pnpm --filter @gaurav-pos/hub-electron build
pnpm --filter @gaurav-pos/hub-electron exec electron-builder --mac dir
```

Launch the Mac app with a temporary DB and remote debugging, then verify:

```text
typeof window.gauravPos === "object"
typeof window.gauravPos.chooseUpdatePackage === "function"
```

If that bridge is missing, the App Updates screen cannot open the native chooser and will ask for a pasted path.

## Clean Release Folder

After the build, remove stale files so nobody chooses the wrong artifact.

Keep only:

```text
Gaurav POS Hub Setup 0.1.4.exe
Gaurav POS Hub-0.1.4.gpos-update.zip
```

Delete old files such as:

```text
*.blockmap
builder-debug.yml
mac-arm64/
win-unpacked/
old *.exe
old *.gpos-update.zip
```

On macOS/Linux:

```bash
find apps/hub-electron/release -mindepth 1 -maxdepth 1 \
  ! -name "Gaurav POS Hub Setup 0.1.4.exe" \
  ! -name "Gaurav POS Hub-0.1.4.gpos-update.zip" \
  -exec rm -rf {} +
```

On Windows PowerShell:

```powershell
Get-ChildItem apps/hub-electron/release | Where-Object {
  $_.Name -ne "Gaurav POS Hub Setup 0.1.4.exe" -and
  $_.Name -ne "Gaurav POS Hub-0.1.4.gpos-update.zip"
} | Remove-Item -Recurse -Force
```

Update the file names when the app version changes.

## Final Hub Validation

From `apps/hub-electron`, validate the update package:

```bash
pnpm exec tsx -e "import { validateUpdatePackage } from './src/update/update-package.ts'; const r = validateUpdatePackage('./release/Gaurav POS Hub-0.1.4.gpos-update.zip', 0); console.log(r.manifest)"
```

Expected important fields:

```text
platform: win32
arch: x64
sqliteNative.format: pe32plus-x64
```

This validation opens the `.gpos-update.zip`, checks the manifest, verifies the installer hash, extracts the actual installer, and confirms the installer contains the same Windows x64 `better_sqlite3.node` hash recorded in the manifest.

Also inspect the manifest and confirm:

- `version` is newer than the app currently installed at the restaurant
- `dbSchemaVersion` equals the current migration count
- `minSourceDbSchemaVersion` allows the restaurant's current DB schema
- `platform` is `win32`
- `arch` is `x64`
- `sqliteNative.format` is `pe32plus-x64`

Also record hashes:

```bash
shasum -a 256 \
  "release/Gaurav POS Hub Setup 0.1.4.exe" \
  "release/Gaurav POS Hub-0.1.4.gpos-update.zip"
```

On Windows PowerShell:

```powershell
Get-FileHash "release/Gaurav POS Hub Setup 0.1.4.exe" -Algorithm SHA256
Get-FileHash "release/Gaurav POS Hub-0.1.4.gpos-update.zip" -Algorithm SHA256
```

## Build Android Expo APK

From `apps/mobile`:

```bash
pnpm dlx eas-cli@18.11.0 build --platform android --profile preview --non-interactive --no-wait
```

This starts the Android APK build and prints an Expo build URL.

Do not poll it manually unless you want to wait. Open the printed Expo URL later and download the APK when it is done.

## What To Send

For a brand-new Hub machine:

```text
Gaurav POS Hub Setup 0.1.4.exe
Android APK from Expo
```

For a Hub update:

```text
Gaurav POS Hub-0.1.4.gpos-update.zip
Android APK from Expo, only if the mobile app changed
```

## Restaurant Install Flow

First-time install:

```text
Run .exe -> complete setup -> configure printers -> pair Android devices
```

Future Hub update:

```text
Open Hub -> App Updates -> choose .gpos-update.zip -> enter Manager PIN -> installer opens -> complete installer
```

Rollback:

```text
Open Hub -> App Updates -> Rollback -> recovery script restores DB backup -> previous installer opens
```

## Never Do This

- Do not delete the live SQLite DB to update the app.
- Do not send stale files from the release folder.
- Do not use a package if SQLite validation fails.
- Do not install an older app over a newer DB without using rollback.
- Do not update during service while orders are open.
