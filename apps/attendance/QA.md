# Verification — 5 September 2026

## Automated checks

- Full repository `pnpm test`: **433 passed, 3 skipped**. This includes 15 Convex, 6 attendance UI utility, 19 shared, 46 existing POS mobile and 347 hub tests.
- New Convex tests: **10 passed**, including payroll rounding, partial months, half days, off allowance, overtime, unmarked/future dates, tenant isolation, one-use pairing, token revocation/expiry, immutable joining dates, salary snapshots, monthly policy isolation, batch marking, archives and device pagination. Function tests run with the edge runtime.
- `pnpm typecheck`: passed across the workspace.
- Cloud admin production build: passed, including the new `/attendance` route.
- Expo dependency compatibility check: passed.
- Android release Gradle build: passed.
- APK signature: verified; dedicated certificate `CN=Sky Attendance, O=Sky Lounge, C=IN`.
- APK package: `com.skylounge.attendance`, version 1.0.0 / code 1, minimum SDK 24, target SDK 36, ARM64.
- `git diff --check`: passed.

The initial broad test run exposed a non-executable packaged `7zip-bin` utility. Its local executable permission was restored; the complete rerun passed without changes to POS source code.

## Native Android verification

Tested in Expo Go and the standalone signed release APK on a dedicated **headless Pixel 4 / Android API 36** emulator. The user's existing emulator data and PS Remote Play were not used for test actions.

An isolated Convex restaurant was used for all sample employees and attendance:

- One-use device pairing and cold restart with persisted secure credentials.
- Real-time roster showing present, off, half day and overtime.
- Creating an employee through the Android form; name, role, joining date and ₹22,000 salary verified directly in Convex.
- Marking attendance through both roster and calendar; future dates disabled.
- Overtime input of 3 hours persisted to Convex. A separate client changed payroll policy while the attendance form was dirty; the pending overtime edit survived.
- Previous/next month navigation preserves the selected employee and correctly disables dates outside employment.
- Policy edits saved from Android and verified directly in Convex.
- Bulk present with confirmation fills only unmarked employees.
- Archive confirmation removes a member from Active while preserving them in Archived. Payroll for an employee who joined and left on the test day calculated 73,333 paise.
- Android share sheet received an actual file named `sky-payroll-arjun-patil-2026-09.csv`. No email or message was sent.
- Cold start with emulator network disabled showed a bounded connection error and recovery options; local credential removal returned to pairing. Network settings were restored.

Native QA found and fixed:

1. NativeWind callback-style Pressables losing styles — explicit interop opt-out preserves their native styling.
2. Android modal keyboard avoidance double-adjusting layout — Android now relies on native resizing, preserving input/button hit targets.
3. Realtime refresh replacing dirty form values — forms initialize by identity/open state and preserve pending edits.
4. Missing shared Convex module visibility in Metro — explicit workspace watch folder.

The final APK was installed over the previous release using its stable signing key. The isolated QA fixture was removed using its guarded cleanup function. The emulator was then paired to the existing `sky` restaurant without adding sample staff.

## Evidence

Local screenshots are under `artifacts/` (ignored by Git): pairing, daily roster, calendar, payroll, CSV share sheet and offline recovery. These screenshots may show temporary QA staff; they are not real restaurant records.

## Release scope

The APK currently points to this repository's configured **Convex development deployment**. The new admin route exists in this checkout and builds successfully; it has not been published to the production admin website. Production backend/admin deployment, Play Store distribution, physical-phone certification and backup of the local release-signing key remain operator release steps. The app is usable by sideload with a pairing code from the authenticated local admin page or internal operator CLI.

No automated check can establish an absolute absence of bugs. No real payroll was paid, locked or finalized, and no real employee records were changed during QA.
