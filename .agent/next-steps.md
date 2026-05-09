# POS Next Steps

Last updated: 2026-05-09

## Immediate Priority

Harden the hub for real restaurant hardware. The first usable pass exists across hub, Android, cloud admin, and Convex sync, but production confidence now depends on printer configuration, device pairing/auth, idempotent commands, and real hardware tests.

## Phase 1: Hub App Foundation

- Done: Electron entrypoint exists and loads the local Fastify UI.
- Done: cashier/admin UI can open day, browse tables/menu, submit KOT, view KDS, bill, settle cash, process print jobs.
- Done: setup APIs exist for floors, tables, production units, and menu items.
- Next:
  - Add in-app setup forms for floors/tables/menu/production units.
  - Add receipt/cashier printer config separate from KOT production units.
  - Add POS day close UI with cash reconciliation.
  - Add bill reprint and KOT reprint buttons to the UI.

## Phase 2: Hub API Hardening

- Add device pairing endpoints:
  - create pairing code/QR.
  - exchange pairing code for local device token.
  - list/revoke paired devices.
- Add local auth middleware for hub routes.
- Add route-level role checks:
  - waiter: table/order draft/submit.
  - kitchen: KDS status updates.
  - cashier: bill/settlement/reprint.
  - admin: settings/day close/device management.
- Add idempotency keys to order submit, KOT reprint, bill generate, and settlement endpoints.
- Add API tests for validation errors, duplicate submissions, and unauthorized roles.
- Add receipt-printer settings and print destination validation.
- Add Fastify route integration tests for the main service flow.

## Phase 3: Convex Cloud Setup

- Keep Convex dev deployment running while editing cloud functions.
- Run `pnpm exec convex dev` interactively to complete Convex-managed WorkOS provisioning.
- Finish WorkOS AuthKit dashboard setup with Google as the only enabled provider.
- Model restaurants, memberships, staff users, devices, synced events, and report summaries.
- Done: event ingestion has an HTTP action/mutation pair protected by `POS_SYNC_SECRET`.
- Next: add restaurant installation identity so synced events map to the correct restaurant without trusting client-provided IDs.
- Add cloud-to-hub sync for:
  - user/role snapshots.
  - device revocation.
  - menu/settings changes when safe.

## Phase 4: Android App

- Done: Expo/React Native shell exists.
- Done: manual hub IP/URL setting exists.
- Done: local draft storage exists through AsyncStorage.
- Done: waiter table/menu/order submit flow exists.
- Done: disconnected state saves draft instead of finalizing.
- Next:
  - Add QR pairing once hub device pairing APIs exist.
  - Add item notes/modifiers UI.
  - Add order update/delta review before sending KOT.
  - Add cashier mode only after local auth/roles exist.
- Build optional cashier flow only after hub cashier UI stabilizes.

## Phase 5: Production Readiness

- Hardware-test with real LAN ESC/POS printers.
- Add backup/restore:
  - scheduled local SQLite backups.
  - manual export.
  - restore wizard.
- Add installation/runbook docs:
  - Windows hub setup.
  - router/static IP setup.
  - printer setup.
  - Android pairing.
- Add observability:
  - local hub logs.
  - sync status page.
  - print failure alerts.

## Test Gaps To Close

- API integration tests for Fastify routes.
- Idempotency tests for duplicate Android submissions.
- Printer retry exhaustion and manual reprint tests.
- POS day close tests with pending print jobs and unpaid bills.
- Convex sync tests with duplicate event ingestion.
- End-to-end smoke test from API order submit to print-job creation to bill settlement.
- Android offline draft unit tests.
- Cloud dashboard queries after WorkOS env setup and Convex codegen.
