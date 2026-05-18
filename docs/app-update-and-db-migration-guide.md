# Hub App Update and Database Migration Guide

This guide explains how the Gaurav POS Hub app should be installed the first time, updated later, and rolled back safely if something goes wrong.

## What The System Protects

The Hub app uses a local SQLite database. That database is precious because it contains the restaurant's real local data.

The update system is designed so that:

- a bad Windows SQLite native binary is rejected before install
- an update cannot run while orders are still open
- the database is checked before update
- a pre-update database backup is created before the new installer opens
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

After first-time install, keep a copy of that exact installer. It becomes the baseline installer for rollback.

## Register Current Version Before Updates

Before installing future updates, the Hub should know what the current working version is.

In the Hub admin update screen:

1. Open **App Updates**.
2. Select the current version's `.gpos-update.zip`.
3. Click/register it as the baseline/current package.

This gives the rollback system a known-good previous installer/package.

## Creating An Update Package

Updates should be created as `.gpos-update.zip` packages, not by manually replacing app files.

Run this on a Windows x64 machine:

```bash
pnpm --filter @gaurav-pos/hub-electron package:update
```

The command builds:

- the Windows NSIS installer
- the update manifest
- checksums
- the `.gpos-update.zip`

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
2. Select the new `.gpos-update.zip`.
3. The app validates the package:
   - correct app id
   - correct platform and arch
   - installer checksum
   - SQLite native checksum
   - installer actually contains the matching SQLite native binary
   - database schema compatibility
4. Enter Manager PIN.
5. Make sure there are no open or billed/running orders.
6. The app runs SQLite `integrity_check`.
7. The app creates a pre-update database backup.
8. The app caches rollback info.
9. The new installer opens visibly.
10. The Hub app exits.
11. Complete the installer wizard.
12. Open the updated Hub app.

On startup, the updated app checks the database schema. If the DB is newer than the app supports, startup is blocked instead of corrupting data.

## Database Migration Rule

Updates can move the DB schema forward.

Rollback does not run reverse migrations. Instead, rollback restores the database backup taken before update. This is the safer professional approach for local SQLite desktop apps.

## Rollback Flow

Use rollback when the new app has a serious issue after update.

1. Open **App Updates**.
2. Click rollback.
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
- Use `.gpos-update.zip` packages for updates.
- Always keep the current known-good installer/package.
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
.gpos-update.zip -> validate -> backup DB -> run new installer -> migrate DB on startup
```

Rollback:

```text
rollback button -> wait for app exit -> restore old DB backup -> run old installer
```

