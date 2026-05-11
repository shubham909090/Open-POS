# POS Next Steps

Last updated: 2026-05-11

## Immediate Priority

Harden the product on real restaurant hardware. The local-first pass exists across hub, Android, cloud admin, Convex sync, receipt printer settings, device pairing, payment recording, and local auth. Production confidence now depends mostly on real Windows printer testing, real LAN testing, WorkOS env completion, and restaurant-specific billing rules.

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
- Done: richer close reconciliation shows opening cash, cash sales, expected drawer, typed variance, UPI/card/online totals, bill totals, discounts, tips, and close blockers.
- Done: manual split-payment UI exists for cash, UPI, card, and online/external payments.
- Done: discount and tip inputs exist on the bill settlement panel.
- Done: extra dish-customization complexity has been removed from the active product. A dish is now just name, price, optional kitchen/counter, and active status.
- Done: hub frontend is now React + TypeScript. TanStack Query owns server state and Zustand owns local UI-only state, so Send to Kitchen and Punch Bill wait for hub confirmation and refetch instead of faking optimistic state.
- Done: close day stores a finalized local daily report snapshot and queues it for cloud sync.
- Done: backup list/create/schedule-restore UI exists.
- Done: production UI pass added operational stats, menu search, draft total, billing context, and toast feedback.
- Next:
  - Hardware-test the simplified setup/order/billing flow on the actual counter machine and phones.

## Phase 2: Hub API Hardening

- Done: Drizzle ORM is installed and configured for the hub SQLite schema.
- Done: Drizzle schema and generated migration snapshot exist under `apps/hub-electron/src/db/drizzle-schema.ts` and `apps/hub-electron/drizzle`.
- Done: hub runtime services now receive the Drizzle database handle.
- Done: hub startup now runs Drizzle migrations directly through `drizzle-orm/better-sqlite3/migrator`.
- Done: obsolete custom SQL migration runner was removed.
- Done: auth, API idempotency, print queue processing, Convex sync outbox, seed data, and migration bookkeeping use Drizzle APIs.
- Done: device pairing endpoints exist for code creation, code exchange, list devices, and revoke device.
- Done: local auth middleware protects hub REST routes and WebSocket realtime.
- Done: route-level role checks exist for waiter, kitchen, cashier, and admin paths.
- Done: kitchen devices are restricted to KDS/KOT status paths and cannot read full table-order/order-detail payloads.
- Done: idempotency keys are supported for order submit, KOT reprint, bill generate, and settlement endpoints.
- Done: API tests cover duplicate submissions and unauthorized roles.
- Done: receipt-printer settings and print destination validation tests exist.
- Done: Fastify route integration tests cover auth, pairing, role enforcement, receipt config, billing, and printing.
- Done: backup/restore service tests exist.
- Done: cloud pull applies menu commands locally.
- Done: `OrderService` write-heavy transaction clusters now use Drizzle query APIs for POS days, table/order state updates, order-item diffs, KOT/KOT-item creation, bill/payment writes, print-job enqueue, event-log/outbox writes, receipt settings, menu/catalog mutations, and core requirement helpers.
- Next: optional read-query cleanup for report/list screens can be done later; the risky service-hour mutation path is now on Drizzle.

## Phase 3: Convex Cloud Setup

- Keep Convex dev deployment running while editing cloud functions.
- Run `pnpm exec convex dev` interactively to complete Convex-managed WorkOS provisioning.
- Finish WorkOS AuthKit dashboard setup with Google as the only enabled provider.
- Done: modeled restaurants, memberships, member invitations, devices, synced events, and report summaries.
- Done: finalized day reports are materialized into Convex `dailyReports`, `dailyReportBills`, and `dailyReportItems`.
- Done: cloud Reports tab shows closed-day sales, payment split, cash reconciliation, bills, and item totals for owner/admin/reporting users.
- Done: event ingestion has an HTTP action/mutation pair protected by `POS_SYNC_SECRET`.
- Done: installation identity maps hub uploads to restaurants without trusting client-provided restaurant IDs.
- Done: cloud event ingestion requires a registered installation id/secret and stores a server-resolved restaurant id.
- Done: installation registration requires owner access and cannot move an existing installation id across restaurants.
- Done: cloud-to-hub command pull supports device revocation, local role/name updates, menu item updates, production-unit updates, and receipt-printer setting updates.
- Done: cloud-admin UI can create restaurants, generate one-click hub connections, manage staff invites/members, view sync health, and keep raw cloud-to-hub commands in Advanced.
- Next: add real email delivery for invitations after choosing a transactional email provider.

## Phase 4: Android App

- Done: Expo/React Native shell exists.
- Done: manual hub IP/URL setting exists.
- Done: manual token input and pairing-code exchange exist.
- Done: hub pairing creates QR payloads and QR images; Android can scan the QR with `expo-camera` or paste the QR payload manually.
- Done: local draft storage exists through AsyncStorage.
- Done: waiter table/menu/order submit flow exists.
- Done: disconnected state saves draft instead of finalizing.
- Done: Android waiter ordering uses simple dish quantity lines only.
- Done: Android shows a KOT review confirmation before final submission.
- Done: device-friendly UI pass added cleaner pairing controls, table grid, menu search, ticket total, and clearer final action.
- Next:
  - Add cashier mode only after the hub cashier flow is stable on real hardware.
- Build optional cashier flow only after hub cashier UI stabilizes.

## Phase 5: Production Readiness

- Hardware-test with real LAN ESC/POS printers.
- Hardware-test with real PC-installed Windows printers.
- Done: beginner hub setup flow is split into a guided checklist with internal IDs/LAN fallbacks hidden under Advanced.
- Done: hub setup now explains the exact missing required step before blocking Take Orders/Kitchen/Billing.
- Done: dry-run development printing no longer blocks setup when no physical printers are connected; production still requires a saved cash-counter printer or LAN/IP fallback.
- Done: pairing waiter/kitchen phones is recommended but no longer blocks the cashier PC from starting service.
- Done: cloud owner setup flow generates hub connection IDs/secrets automatically and shows copyable env text instead of asking owners to invent IDs.
- Add backup/restore:
  - Done: manual hot backup.
  - Done: restart-based restore scheduling.
  - Next: scheduled automatic backups.
- Add installation/runbook docs:
  - Done: Windows hub setup and packaging runbook.
  - Next: run `pnpm --filter @gaurav-pos/hub-electron package:win` on Windows hardware/CI because macOS cannot cross-compile `better-sqlite3`.
  - router/static IP setup.
  - printer setup.
  - Done: Android QR/manual pairing path exists.
  - Done: Android pairing runbook exists in `docs/android-pairing.md`.
- Add observability:
  - local hub logs.
  - Done: cloud admin has a Sync Health section for installations, recent events, and command preview.
  - print failure alerts.

## Test Gaps To Close

- More API integration tests for validation errors and edge cases.
- Done: idempotency test covers duplicate Android order submission.
- Done: printer retry exhaustion tests exist.
- Done: POS day close test blocks close while a bill/order is still unpaid.
- Convex sync tests for duplicate HTTP ingestion in Convex itself.
- End-to-end smoke test from API order submit to print-job creation to bill settlement.
- Android offline draft unit tests; mobile hub client tests exist.
- Done: Convex codegen now succeeds against the configured dev deployment.
- Visual browser/device QA on the actual Windows hub monitor and Android phone after env and hardware are available.
