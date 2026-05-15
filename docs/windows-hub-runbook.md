# Windows Hub Runbook

## Build Installer

From the repo root:

```bash
pnpm install
pnpm --filter @gaurav-pos/hub-electron package:win
```

The NSIS installer is written to `apps/hub-electron/release`.

## First Run

For normal restaurant installs:

1. Start `Gaurav POS Hub`.
2. Create the Manager PIN on the hub PC itself. First PIN creation is blocked from other LAN devices.
3. Click **Unlock setup** and enter the Manager PIN.
4. Open **Setup → Hub Connection And Security**.
5. Paste the cloud URL, hub connection ID, sync secret, and hub public LAN URL.
6. Save, reveal, or test sensitive cloud values through the Manager Approval popup.

The app stores these values in local SQLite settings. The raw Manager PIN is never stored.
The local SQLite database and backups are stored in the Windows app-data folder by default, so normal installs do not need `HUB_DATABASE_PATH` or `HUB_BACKUP_DIR`.
If the hub needs to be wiped during setup or support, use **Advanced → Danger zone → Full Reset Hub**. The reset is Manager PIN protected, requires typing `RESET HUB`, and restarts the app after scheduling the wipe.

## Recovery Envs

For developer/support fallback only, put values in:

```text
C:\ProgramData\Gaurav POS Hub\hub.env
```

The app also reads `%APPDATA%\Gaurav POS Hub\hub.env`, `HUB_CONFIG_FILE`, or `GAURAV_POS_CONFIG`.

```bash
HUB_HOST=0.0.0.0
HUB_PORT=3737
# Optional. Leave these out for normal installs.
# HUB_DATABASE_PATH=C:\ProgramData\Gaurav POS Hub\data\hub.sqlite
# HUB_BACKUP_DIR=C:\ProgramData\Gaurav POS Hub\backups
```

Cloud sync values may still be read from env as a recovery fallback, but the production workflow is the Hub setup screen.

Fresh installs start in **Printer Test Mode**. Change printing from Hub → Setup → Printer Mode And Cash Counter after printer tests pass.

See [restaurant-handoff.md](packaging/restaurant-handoff.md) for the full packaging and install flow.

## Startup

Use Windows Startup Apps or Task Scheduler to start `Gaurav POS Hub` when the hub PC boots. The app must run on the same LAN as waiter devices and PC-installed printers.

## Backups

The hub UI can create hot SQLite backups while service is running. Restore is intentionally scheduled for the next app restart so the open SQLite file is never replaced while active.

## Hardware Checks

Before a live service day:

- Confirm each printer appears in Windows printers.
- Select the receipt printer and each production-unit printer in Setup.
- Run **Print test bill** and **Print test kitchen ticket** in Test Mode.
- Switch to **Live Mode** in Hub Setup, then confirm one real KOT/BOT and one real bill print.
- Confirm failed print jobs stay retryable.
