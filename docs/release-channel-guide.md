# Regular and UI nightly releases

The regular release keeps the existing interface and adds the shared payment QR and gradual 0–10 receipt text sizing. The later UI/UX work stays on `codex/t3-ui-ux`, separate from `main`.

| Channel | Windows Hub | Android | Intended use |
| --- | --- | --- | --- |
| Regular | 0.1.23 | 0.1.13, versionCode 13 | Restaurant installation, existing UI |
| UI nightly | 0.1.24 | 0.1.14, versionCode 14 | Manual testing of the redesigned UI |

Release pages become available after the corresponding builds pass and are published:

- [Regular release](https://github.com/shubham909090/Open-POS/releases/tag/hub-v0.1.23)
- [UI nightly prerelease](https://github.com/shubham909090/Open-POS/releases/tag/hub-v0.1.24)

## Updating the restaurant

The Hub's normal **Update app** check selects published stable GitHub releases. It ignores drafts and prereleases; it does not follow the current Git branch. Keep the UI nightly marked **prerelease**, never Latest. Once regular 0.1.23 is published, a Hub on an earlier stable version should offer it, with the existing UI.

Android has no in-app or OTA updater. Download the regular `Gaurav-POS-Mobile-0.1.13.apk` and install it over the existing app. Keep the same application ID and signing certificate. Do not uninstall first, because uninstalling removes local app data. Update the Windows Hub as well to enable the QR endpoints.

The two features introduce no database schema migration. The Windows update checks database compatibility and makes a pre-update backup. Keep that backup and confirm one customer bill and one KOT on the actual printer after installing; automated tests do not establish physical print quality.

## QR permissions and behavior

- Admin and captain can upload, replace, resize or remove the shared QR **with the Master PIN**. Other roles cannot change it, even if they know that PIN.
- All paired staff roles can display and download/share the current QR without the Master PIN.
- Upload another QR image whenever the receiving account changes. This is a static payment QR; it does not connect to a Google Pay account or confirm payment automatically. Staff still verify payment in the receiving UPI app.
- The QR prints on customer bills before the footer, never on KOT/bar tickets. Print size defaults to 32 mm, with a 20–45 mm control; printable width and QR density constrain the rendered size.
- Existing receipt text-size settings remain supported and map into the gradual sizing controls.

## Testing the UI nightly

The nightly is installed manually and uses the same app identity/signing key as regular. It replaces the installed app rather than creating a second side-by-side app. Use a test device/database and preserve backups.

There is no nightly/stable channel switch. Hub 0.1.24 will not automatically downgrade to regular 0.1.23, and Android will reject an ordinary in-place downgrade from versionCode 14 to 13. A future regular release that replaces this nightly should use Hub 0.1.25 or higher and Android versionCode 15 or higher. Alternatively, intentionally promote the reviewed nightly after approval. Do not uninstall the production mobile app merely to force a downgrade.

Merging the UI PR changes source code only. Publishing a stable release is the separate action that makes it available to the restaurant updater.
