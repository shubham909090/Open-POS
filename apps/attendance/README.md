# Sky Attendance

A separate Android app for restaurant employee attendance. It has its own package ID (`com.skylounge.attendance`) and does not replace the POS mobile app. It connects to the same Convex project.

## Use the app

1. Download `Sky-Attendance-1.0.0.apk` from [GitHub Releases](https://github.com/shubham909090/Open-POS/releases/tag/attendance-v1.0.0) and install it on an Android 7+ ARM64 phone.
2. Generate a fresh pairing code through the operator CLI below, or open `/attendance` on an admin instance running this checkout, sign in as the restaurant owner/admin, select **sky**, and create a pairing code. Pairing codes are private and are never included in the public release.
3. Paste the complete code into Sky Attendance. Codes expire after 10 minutes and work once.
4. Add staff under **Team**, then tap their daily roster entry to mark **Present**, **Off**, **Half day**, or **Overtime**. Overtime includes a full present day plus additional hours.
5. Open a team member for their month calendar, salary breakdown and CSV file export. **Settings** controls the current month's rules.

The local build currently uses the repository's configured **development Convex deployment** (`fine-camel-186`). The admin page must be served from this checkout or deployed with the backend to the matching environment. Do not confuse the development deployment with a production rollout.

## Published Android release

Version 1.0.0 is distributed as a public GitHub prerelease because this build uses the development backend. It is a signed sideload APK, not a Google Play listing. The attendance tag is separate from Hub releases, and it does not replace the latest POS release. Verify the download with the accompanying `SHA256SUMS.txt`.

## Salary rules

- Salary is stored in integer paise. Daily rate = monthly salary / actual calendar days in the month.
- Salary is prorated from the joining date through the end of the month, or through the archive date inclusive.
- Default paid offs: **4 per month**, configurable 0–31. The full monthly allowance is available to a partial-month employee. No rollover.
- An **Off** uses the allowance first; extra off days deduct one daily rate. **Half day** deducts half a daily rate.
- Default standard day: **8 hours**. Default overtime multiplier: **1.5×**. Overtime pay = daily rate / standard hours × overtime hours × multiplier.
- Each monetary component rounds to the nearest paise. The UI shows estimates; CSV preserves two decimal places.
- Missing elapsed attendance is **unresolved**, never silently present. Future dates are pending and cannot be marked. A final total is only available when every eligible date is elapsed and marked.
- Joining dates are immutable after creation. Salary edits take effect from the current restaurant month; previous monthly salary snapshots stay intact. Name/role changes remain editable.
- Rules are saved for the selected month only; an unconfigured month uses the defaults. Changing rules does not rewrite another month's settings.
- Archives preserve attendance and past payroll. The app supports 100 active staff, 1,000 archived directory entries and 200 eligible staff per payroll month. Capacity checks fail visibly instead of silently truncating payroll.

These are configurable business calculations, not a statutory payroll/tax engine. There is no payment transfer, payslip approval/locking, tax, PF, ESI, or leave-accrual engine.

## Development

From the repository root:

```sh
pnpm install
cp apps/attendance/.env.example apps/attendance/.env.local
# Set EXPO_PUBLIC_CONVEX_URL to the intended Convex deployment.
pnpm exec convex dev --once
pnpm dev:attendance
```

Expo Go works with the app's modules. The development server uses port 8082. Never put a deployment key, WorkOS secret, device token, or pairing code in `EXPO_PUBLIC_*` variables.

```sh
pnpm --filter @gaurav-pos/attendance typecheck
pnpm exec vitest run convex/attendance
pnpm --filter @gaurav-pos/attendance test
pnpm --filter @gaurav-pos/cloud-admin typecheck
pnpm --filter @gaurav-pos/attendance build:apk
```

`build:apk` prebuilds Android, compiles a release APK with two Gradle workers, and uses a dedicated persistent signing key. It discovers JDK 17 at `.agent/tools/jdk-17` or `JAVA_HOME` and the Android SDK from `ANDROID_HOME` or `~/Library/Android/sdk`.

**Back up `.agent/attendance-signing/` securely.** It contains the release keystore and private credentials required to issue compatible future APK updates. These files are ignored by Git and are never packaged in the app. This is a sideload APK; Play Store publishing is separate.

## Pairing from the CLI

For a trusted operator with Convex deployment access:

```sh
pnpm exec convex run attendanceProvisioning:provisionPairingCode '{"restaurantId":"YOUR_RESTAURANT_ID","expiresInMinutes":10}'
```

This is an internal mutation, not a public signup or restaurant-discovery endpoint. Normal users should use the authenticated admin page. Admins can revoke devices there. Device credentials last up to one year, are stored in Android secure storage, and only SHA-256 hashes are stored in Convex. Every request derives its restaurant from the credential on the server.

An online sign-out revokes the server credential and removes the local credential. Offline sign-out removes the local credential; an admin should also revoke that phone on the admin page. The app keeps no persistent attendance cache and blocks new writes while disconnected. Clock refreshes on foreground and every minute keep dates and credential expiry current.

## Architecture

- `src/data-provider.tsx`: typed Convex subscriptions, mutations, secure session storage and connectivity.
- `src/screens/`: pairing, daily roster, team directory, employee calendar/payroll and monthly settings.
- `src/components/`: shared accessible controls, sheets, navigation and visual tokens.
- `src/utils.ts`: date/currency formatting and safe CSV generation.
- `../../convex/attendance.ts`: scoped attendance/employee/payroll API.
- `../../convex/attendanceModel.ts`: pure payroll/date calculation with tests.
- `../../convex/attendancePairing.ts`: one-use pairing, owner/admin device management and audit access.
- `../../convex/attendanceProvisioning.ts`: internal operator provisioning and isolated QA fixtures.

No Zustand is needed: local form/navigation state stays in React, and Convex owns server state. NativeWind is configured alongside typed React Native design tokens. All mutations are validated and audit meaningful before/after values.

## Isolated QA

`attendanceProvisioning:setupQaFixture` creates a specially marked restaurant with an independent pairing code. `cleanupQaFixture` only deletes data when both its fixture registry and exact restaurant marker match. Never seed sample staff into a real restaurant. See `QA.md` for the verified device flows and remaining release scope.
