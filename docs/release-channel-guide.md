# Official and nightly releases

Hub 0.1.27 and Android 0.1.17 are the official release targets. This release adds optional receipt sections, logo cropping for app identity, higher-quality bill logos and per-printer logo sizing while preserving the compact interface and existing shortcuts.

| Channel | Windows Hub | Android | Intended use |
| --- | --- | --- | --- |
| Official | 0.1.27 | 0.1.17, versionCode 17 | Receipt visibility, logo cropping and printer logo controls |
| Previous official | 0.1.26 | 0.1.16, versionCode 16 | Compact redesign, complete menu-size layouts and preserved shortcuts |
| Earlier official | 0.1.25 | 0.1.15, versionCode 15 | Initial redesign and new update controls |
| Previous regular | 0.1.23 | 0.1.13, versionCode 13 | Previous interface with QR and text sizing |
| Previous UI nightly | 0.1.24 | 0.1.14, versionCode 14 | Earlier manual UI preview |

Release pages:

- [Official release](https://github.com/shubham909090/Open-POS/releases/tag/hub-v0.1.27)
- [Previous regular release](https://github.com/shubham909090/Open-POS/releases/tag/hub-v0.1.23)
- [UI nightly prerelease](https://github.com/shubham909090/Open-POS/releases/tag/hub-v0.1.24)

Hub 0.1.25/0.1.26 and Android 0.1.15/0.1.16 can use their update buttons to receive this release.

## Updating the restaurant

The Hub's **Update app** check selects published stable GitHub releases. It ignores drafts and prereleases; it does not follow the current Git branch. Keep old nightlies marked **prerelease**. The reviewed redesign is now the normal update target.

Installed Hub 0.1.23/0.1.24 needs one manual installation of the verified latest installer: those installed versions still contain the old launch code. Back up, close Hub and run the new installer over the existing installation. Keep the database and application-data directories.

Android 0.1.13/0.1.14 needs one manual installation of the latest official APK over the existing app. Do not uninstall: that removes pairing and local drafts. From 0.1.15, every role can use **Settings → App update** to check, download and open Android's installer. Android still requires the user to allow installation and confirm it. A download or installer prompt is not proof that installation completed.

These settings introduce no database schema migration. The Windows update checks database compatibility and makes a pre-update backup. Keep that backup and confirm one customer bill and one KOT on the actual printer after installing; automated tests do not establish physical print quality.

The earlier [Windows online-update check](https://github.com/shubham909090/Open-POS/actions/runs/41826270631) downloaded the published installer through **Update app**, verified its checksum, created a backup, installed and reopened with the test database and PIN retained. Its starting installation contained the fixed updater; this does not repair the historical 0.1.23/0.1.24 binary already on a restaurant PC. Android's real update flow also passed download cancellation/retry, checksum verification, install permission, Play Protect and installation, retaining pairing and an unsent draft. A separate direct 0.1.12 → 0.1.15 installation retained the same data.

## QR permissions and behavior

- Admin and captain can upload, replace or remove the shared QR **with the Master PIN**. Other roles cannot change it, even if they know that PIN.
- All paired staff roles can display and download/share the current QR without the Master PIN.
- Upload another QR image whenever the receiving account changes. This is a static payment QR; it does not connect to a Google Pay account or confirm payment automatically. Staff still verify payment in the receiving UPI app.
- The QR prints on customer bills before the footer by default, never on KOT/bar tickets. The customer bill layout can hide it without deleting the saved QR. Each bill printer has its own 20–45 mm size and optional roll-width override in **Settings → Printers & receipts**. Existing settings fall back to the saved global size (32 mm by default); printable width and QR density constrain the actual output.
- Restaurant name and PNG/JPEG logo can be changed by admin/captain with the Master PIN. Both clients show the saved identity. Name and logo have independent customer-bill visibility switches; kitchen/bar tickets never print branding. Icon cropping preserves the complete bill artwork. Windows window/installation shortcut icons and the Android restaurant home-screen shortcut follow the saved icon; the Android primary app-drawer icon remains embedded in the APK. See [Restaurant branding](restaurant-branding.md).
- Existing receipt text-size settings remain supported and map into the gradual sizing controls.

## Testing the UI nightly

The nightly is installed manually and uses the same app identity/signing key as regular. It replaces the installed app rather than creating a second side-by-side app. Use a test device/database and preserve backups.

There is no nightly/stable channel switch. Hub 0.1.25 and Android versionCode 15 move forward from the nightly without a downgrade. Do not uninstall the production mobile app to force an older version.

Merging the UI PR changes source code only. Publishing a stable release is the separate action that makes it available to the restaurant updater.

## Optional receipt content

In Settings → Printers & receipts → Ticket layout, independently show or hide restaurant name, logo, payment QR and customer name. Optional address, GST line, header and footer have adjacent checkboxes. Kitchen tickets also support hiding order and item notes. Hidden sections retain their saved text and styling; essential item rows and totals always remain. Existing installations default every new switch to on. Size 0 remains the smallest text, not a visibility switch.
