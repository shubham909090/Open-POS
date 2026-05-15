# Restaurant Handoff Packaging

This is the practical handoff path for installing Gaurav POS in a restaurant.

## What You Send

Send two installable apps:

- **Windows Hub** for the admin PC.
- **Android APK** for waiter tablets.

The cloud portal is not installed on the restaurant computer. The owner opens it in a browser for hub connection setup and day reports.

## Windows Hub Config File

The packaged hub reads config from environment variables first, then from these files:

1. Path from `HUB_CONFIG_FILE`
2. Path from `GAURAV_POS_CONFIG`
3. `%APPDATA%\Gaurav POS Hub\hub.env`
4. `C:\ProgramData\Gaurav POS Hub\hub.env`
5. `hub.env` beside the current launch folder
6. `.env.local` for local development

For a restaurant PC, use:

```text
C:\ProgramData\Gaurav POS Hub\hub.env
```

Create the folder if it does not exist. Copy `apps/hub-electron/resources/hub.env.example` into that path and edit it.

## Example Restaurant Hub Config

```env
HUB_HOST=0.0.0.0
HUB_PORT=3737
HUB_PUBLIC_URL=http://192.168.1.20:3737

HUB_DATABASE_PATH=C:\ProgramData\Gaurav POS Hub\data\hub.sqlite
HUB_BACKUP_DIR=C:\ProgramData\Gaurav POS Hub\backups
HUB_ADMIN_TOKEN=replace-with-a-long-random-password

CONVEX_HTTP_URL=https://your-convex-site.convex.site
POS_INSTALLATION_ID=paste-from-cloud-portal
POS_SYNC_SECRET=paste-from-cloud-portal
```

`HUB_PUBLIC_URL` must use the Windows PC LAN IP. Give that PC a fixed router DHCP reservation before pairing tablets.

Printer output is controlled from the hub UI, not by env. A fresh hub starts in **Printer Test Mode**. In Hub → Setup → Printer Mode And Cash Counter, select printers, run test prints, then switch to **Live Mode** before service.

## Build Windows Hub Installer

From the repo root:

```bash
pnpm install
pnpm --filter @gaurav-pos/hub-electron package:win
```

Output:

```text
apps/hub-electron/release/
```

Send the generated `.exe` installer to your brother.

For wider production distribution later, buy a Windows code-signing certificate and add it to CI. For the first restaurant test, the unsigned installer is usable but Windows may show a SmartScreen warning.

### Important Mac Note

Building a Windows `.exe` from macOS may require Wine. If the command fails on Mac, build the installer on a Windows machine or CI runner. The app code and config are ready for that packaging path.

## Install On Restaurant Windows PC

1. Install the generated hub `.exe`.
2. Create `C:\ProgramData\Gaurav POS Hub\hub.env`.
3. Paste the cloud hub connection values from the cloud portal into `hub.env`.
4. Set the PC LAN IP in `HUB_PUBLIC_URL`.
5. Start **Gaurav POS Hub**.
6. Unlock with `HUB_ADMIN_TOKEN`.
7. Set up floors, tables, kitchens/counters, dishes, sale groups, manager PIN, and printers.
8. Create pairing QR codes for tablets.

## Build Android APK

Use EAS for the cleanest APK handoff:

```bash
pnpm --filter @gaurav-pos/mobile exec eas login
pnpm --filter @gaurav-pos/mobile android:apk
```

This creates a preview APK you can install directly on waiter tablets.

For Play Store style production distribution:

```bash
pnpm --filter @gaurav-pos/mobile android:aab
```

## Install On Tablets

1. Install the APK on each Android tablet.
2. Connect tablet to the same restaurant Wi-Fi/LAN as the hub PC.
3. Open the hub Setup screen.
4. Create a pairing QR for that waiter/tablet.
5. Open the Android app and scan the QR.
6. The tablet stores its local device token. Staff should not type the hub admin password on tablets.

## Daily Restaurant Flow

1. Captain or admin opens the hub app.
2. Hub automatically uses the current 6 AM IST business day.
3. Waiters take orders on tablets.
4. Hub creates KOTs and print jobs locally.
5. Captain punches bills from occupied tables.
6. After the next 6 AM IST boundary, hub finalizes the old settled business day.
7. Hub saves the local report and syncs it to cloud when internet is available.
