# Hub App Update and Database Migration Guide

This guide explains how the Gaurav POS Hub app should be installed the first time, updated later, and rolled back safely if something goes wrong.

For the repeatable build commands used to create the `.exe`, `latest.yml`, `.exe.blockmap`, `hub-update-metadata.json`, fallback `.gpos-update.zip`, and Android APK, see [Release Build Workflow](./release-build-workflow.md).

## What The System Protects

The Hub app uses a local SQLite database. That database is precious because it contains the restaurant's real local data.

The update system is designed so that:

- a normal update is one click from the Hub app
- an update cannot run while orders are still open
- release metadata must prove the target app is compatible with the current DB schema before download/install
- the database is checked before install
- a pre-update database backup is created before the Electron updater installs
- rollback restores the pre-update database backup instead of trying to reverse migrations

## First-Time Install

Use the normal Windows installer for the first installation.

1. Build or get the first Windows x64 installer.
2. Copy the installer to your brother's Windows machine.
3. Run the installer normally.
4. Open Gaurav POS Hub.
5. Complete first-time setup:
   - set Manager PIN
   - set Master PIN if needed
   - configure printers
   - pair waiter/KDS/mobile devices
   - verify billing, KOT, BOT, and print test flows

After first-time install, future normal updates come from published GitHub Releases through the Hub's **Update app** button.

## Creating An Update Package

Normal updates should be created as one-click Electron updater releases, not by manually replacing app files. The fallback `.gpos-update.zip` is still produced for recovery/diagnostics.

Run this on a Windows x64 machine:

```bash
pnpm --filter @gaurav-pos/hub-electron package:update
```

The command builds:

- the Windows NSIS installer
- Electron updater metadata (`latest.yml`)
- installer blockmap metadata
- Hub DB compatibility metadata (`hub-update-metadata.json`)
- the update manifest
- checksums
- the fallback `.gpos-update.zip`

The package build must prove:

- the app id is correct
- platform is `win32`
- arch is `x64`
- SQLite native binary is Windows x64 `PE32+`
- the packaged app can load SQLite
- migrations can run
- SQLite integrity check passes
- the selected installer actually contains the expected `better_sqlite3.node`

If any of these checks fail, do not use that build.

## Update Flow

On your brother's Hub app:

1. Open **App Updates** in admin.
2. Click **Update app**.
3. The app checks the published GitHub Release metadata and refuses the update if the target build is not compatible with the current local DB schema.
4. Make sure there are no open or billed/running orders.
5. The app downloads the update through Electron updater.
6. The app runs SQLite `integrity_check`.
7. The app creates a pre-update database backup.
8. The updater installs and restarts the Hub.

On startup, the updated app checks the database schema. If the DB is newer than the app supports, startup is blocked instead of corrupting data.

## Database Migration Rule

Updates can move the DB schema forward.

Rollback does not run reverse migrations. Instead, rollback restores the database backup taken before update. This is the safer professional approach for local SQLite desktop apps.

## Rollback Flow

Use rollback when the new app has a serious issue after update.

1. Use the recovery rollback script created during the failed update, or open the hidden/manual recovery controls if that build still has them.
2. Launch rollback.
3. The Hub launches the recovery `.cmd`.
4. The Hub exits.
5. The recovery script waits until the Hub process is fully closed.
6. The script removes SQLite sidecar files:
   - `-wal`
   - `-shm`
   - `-journal`
7. The script restores the pre-update database backup.
8. The script launches the previous installer visibly.
9. Complete the old installer wizard.
10. Open Hub again.

After rollback, the app should be back on the old app version with the old pre-update database state.

## Important Operating Rules

- Never delete the live database to update the app.
- Never install random `.exe` files as updates.
- Use **Update app** for normal Hub updates.
- Keep the current known-good installer for recovery.
- Do not update during service hours if orders are open.
- Do not force downgrade without rollback backup restore.
- If update validation fails, do not install that package.

## Simple Mental Model

First install:

```text
Installer.exe -> app installed -> new local SQLite DB/setup starts
```

Normal update:

```text
Update app -> check GitHub release -> download -> backup DB -> install/restart -> migrate DB on startup
```

Rollback:

```text
rollback button -> wait for app exit -> restore old DB backup -> run old installer
```
