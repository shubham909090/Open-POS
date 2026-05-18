# Release Build Workflow

This is the repeatable workflow for creating fresh Hub Windows builds and Android Expo builds.

Use this when preparing files for the restaurant.

## Output Files

After a clean release, the Hub release folder should contain only:

```text
apps/hub-electron/release/Gaurav POS Hub Setup 0.1.0.exe
apps/hub-electron/release/Gaurav POS Hub-0.1.0.gpos-update.zip
```

Use the `.exe` for first-time install.

Use the `.gpos-update.zip` for in-app updates.

## Important Rule

The trusted Hub release build must be created on Windows x64.

Reason: the package command must run the packaged Windows app with `--self-test-sqlite`. That proves the packaged `better-sqlite3` native binary actually loads inside the packaged Electron app.

If the build is attempted on macOS and the SQLite guard fails, do not use that package.

## Before Building

From the repo root:

```bash
pnpm install
pnpm --filter @gaurav-pos/hub-electron test
pnpm --filter @gaurav-pos/hub-electron typecheck
```

Only continue if tests and typecheck pass.

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

## Clean Release Folder

After the build, remove stale files so nobody chooses the wrong artifact.

Keep only:

```text
Gaurav POS Hub Setup 0.1.0.exe
Gaurav POS Hub-0.1.0.gpos-update.zip
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
  ! -name "Gaurav POS Hub Setup 0.1.0.exe" \
  ! -name "Gaurav POS Hub-0.1.0.gpos-update.zip" \
  -exec rm -rf {} +
```

On Windows PowerShell:

```powershell
Get-ChildItem apps/hub-electron/release | Where-Object {
  $_.Name -ne "Gaurav POS Hub Setup 0.1.0.exe" -and
  $_.Name -ne "Gaurav POS Hub-0.1.0.gpos-update.zip"
} | Remove-Item -Recurse -Force
```

Update the file names when the app version changes.

## Final Hub Validation

From `apps/hub-electron`, validate the update package:

```bash
pnpm exec tsx -e "import { validateUpdatePackage } from './src/update/update-package.ts'; const r = validateUpdatePackage('./release/Gaurav POS Hub-0.1.0.gpos-update.zip', 0); console.log(r.manifest)"
```

Expected important fields:

```text
platform: win32
arch: x64
sqliteNative.format: pe32plus-x64
```

Also record hashes:

```bash
shasum -a 256 \
  "release/Gaurav POS Hub Setup 0.1.0.exe" \
  "release/Gaurav POS Hub-0.1.0.gpos-update.zip"
```

On Windows PowerShell:

```powershell
Get-FileHash "release/Gaurav POS Hub Setup 0.1.0.exe" -Algorithm SHA256
Get-FileHash "release/Gaurav POS Hub-0.1.0.gpos-update.zip" -Algorithm SHA256
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
Gaurav POS Hub Setup 0.1.0.exe
Android APK from Expo
```

For a Hub update:

```text
Gaurav POS Hub-0.1.0.gpos-update.zip
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

