# POS Next Steps

Last updated: 2026-05-09

## Immediate Priority

Harden the hub for real restaurant hardware. The usable local-first pass exists across hub, Android, cloud admin, Convex sync, receipt printer settings, and local device auth; production confidence now depends on idempotent commands, real hardware tests, backups, and setup polish.

## Phase 1: Hub App Foundation

- Done: Electron entrypoint exists and loads the local Fastify UI.
- Done: cashier/admin UI can open day, browse tables/menu, submit KOT, view KDS, bill, settle cash, process print jobs.
- Done: setup APIs exist for floors, tables, production units, and menu items.
- Done: receipt/cashier printer setting exists and bills route to it.
- Done: basic pairing-code creation UI exists.
- Done: in-app setup forms exist for floors, tables, production units, and menu items.
- Done: setup flow is separated from service/kitchen/billing views.
- Done: PC-installed system printer selection exists, with LAN/IP fallback.
- Done: POS day close UI exists with closing cash input.
- Done: bill reprint and KOT reprint buttons exist.
- Done: menu edit/enable/disable controls exist.
- Done: device list/revoke UI exists.
- Done: cash reconciliation summary exists before day close.
- Done: backup list/create/schedule-restore UI exists.
- Next:
  - Add richer cash reconciliation details before day close.
  - Add modifier/item-note catalog setup after real menu requirements.

## Phase 2: Hub API Hardening

- Done: Drizzle ORM is installed and configured for the hub SQLite schema.
- Done: Drizzle schema and generated migration snapshot exist under `apps/hub-electron/src/db/drizzle-schema.ts` and `apps/hub-electron/drizzle`.
- Done: hub runtime services now receive the Drizzle database handle.
- Done: auth, API idempotency, print queue processing, Convex sync outbox, seed data, and migration bookkeeping use Drizzle APIs.
- Done: device pairing endpoints exist for code creation, code exchange, list devices, and revoke device.
- Done: local auth middleware protects hub REST routes and WebSocket realtime.
- Done: route-level role checks exist for waiter, kitchen, cashier, and admin paths.
- Done: idempotency keys are supported for order submit, KOT reprint, bill generate, and settlement endpoints.
- Add API tests for validation errors, duplicate submissions, and unauthorized roles.
- Done: receipt-printer settings and print destination validation tests exist.
- Done: Fastify route integration tests cover auth, pairing, role enforcement, receipt config, billing, and printing.
- Done: backup/restore service tests exist.
- Done: cloud pull applies menu commands locally.
- Next: replace the custom SQL migration runner with Drizzle migrations only after a clean migration compatibility pass against existing local hub databases.
- Next: gradually convert `OrderService` internals from prepared statements to Drizzle query builder, one transaction cluster at a time, keeping KOT/billing tests green.

## Phase 3: Convex Cloud Setup

- Keep Convex dev deployment running while editing cloud functions.
- Run `pnpm exec convex dev` interactively to complete Convex-managed WorkOS provisioning.
- Finish WorkOS AuthKit dashboard setup with Google as the only enabled provider.
- Model restaurants, memberships, staff users, devices, synced events, and report summaries.
- Done: event ingestion has an HTTP action/mutation pair protected by `POS_SYNC_SECRET`.
- Done: installation identity maps hub uploads to restaurants without trusting client-provided restaurant IDs.
- Done: cloud-to-hub command pull supports device revocation, local role/name updates, menu item updates, production-unit updates, and receipt-printer setting updates.
- Next: build cloud-admin UI for creating restaurants, registering installations, and queueing hub commands.

## Phase 4: Android App

- Done: Expo/React Native shell exists.
- Done: manual hub IP/URL setting exists.
- Done: manual token input and pairing-code exchange exist.
- Done: local draft storage exists through AsyncStorage.
- Done: waiter table/menu/order submit flow exists.
- Done: disconnected state saves draft instead of finalizing.
- Next:
  - Add QR rendering/scanning on top of the existing pairing-code APIs.
  - Add item notes/modifiers UI.
  - Add order update/delta review before sending KOT.
  - Add cashier mode only after local auth/roles exist.
- Build optional cashier flow only after hub cashier UI stabilizes.

## Phase 5: Production Readiness

- Hardware-test with real LAN ESC/POS printers.
- Hardware-test with real PC-installed Windows printers.
- Add backup/restore:
  - Done: manual hot backup.
  - Done: restart-based restore scheduling.
  - Next: scheduled automatic backups.
- Add installation/runbook docs:
  - Done: Windows hub setup and packaging runbook.
  - Next: run `pnpm --filter @gaurav-pos/hub-electron package:win` on Windows hardware/CI because macOS cannot cross-compile `better-sqlite3`.
  - router/static IP setup.
  - printer setup.
  - Android pairing.
- Add observability:
  - local hub logs.
  - sync status page.
  - print failure alerts.

## Test Gaps To Close

- More API integration tests for validation errors and edge cases.
- Done: idempotency test covers duplicate Android order submission.
- Printer retry exhaustion tests.
- More POS day close tests with pending print jobs and unpaid bills.
- Convex sync tests for duplicate HTTP ingestion in Convex itself.
- End-to-end smoke test from API order submit to print-job creation to bill settlement.
- Android offline draft unit tests; mobile hub client tests exist.
- Cloud dashboard queries after WorkOS env setup and Convex codegen.
