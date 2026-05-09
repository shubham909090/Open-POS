# Windows Hub Runbook

## Build Installer

From the repo root:

```bash
pnpm install
pnpm --filter @gaurav-pos/hub-electron package:win
```

The NSIS installer is written to `apps/hub-electron/release`.

## Runtime Envs

Set these on the Windows hub machine before launching the packaged app:

```bash
HUB_HOST=0.0.0.0
HUB_PORT=3737
HUB_DATABASE_PATH=C:\GauravPOS\data\hub.sqlite
HUB_BACKUP_DIR=C:\GauravPOS\backups
HUB_PRINTER_DRY_RUN=false
HUB_ADMIN_TOKEN=<long local admin token>
CONVEX_HTTP_URL=<convex http url>
POS_SYNC_SECRET=<sync secret>
POS_INSTALLATION_ID=<restaurant installation id>
```

## Startup

Use Windows Startup Apps or Task Scheduler to start `Gaurav POS Hub` when the cashier PC boots. The app must run on the same LAN as waiter devices and PC-installed printers.

## Backups

The hub UI can create hot SQLite backups while service is running. Restore is intentionally scheduled for the next app restart so the open SQLite file is never replaced while active.

## Hardware Checks

Before a live service day:

- Confirm each printer appears in Windows printers.
- Select the receipt printer and each production-unit printer in Setup.
- Send one KOT and one bill in dry-run disabled mode.
- Confirm failed print jobs stay retryable.
