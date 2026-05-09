# Devlog

## 2026-05-09

- Task: Created initial offline-first POS monorepo and implemented the SQLite-backed local hub core.
- Files added or changed: root workspace config, `packages/shared`, `apps/hub-electron`, `apps/mobile`, `apps/cloud-admin`, `convex`, `docs/reference-intake.md`.
- Important modules: `OrderService`, `HubDatabase`, `PrintJobService`, hub REST/WebSocket server, shared Zod command schemas.
- Reusable pieces: use `packages/shared/src/schemas.ts` before adding API payload types; use `apps/hub-electron/src/domain/order-service.ts` for KOT/billing rules.
- Notes: Reference repos live in `/Users/shubhamtemak/Documents/ExampleRepos`; Floreant source is SVN-hosted and `svn` is not installed locally, so Floreant was used via public docs rather than a local checkout.

## 2026-05-09

- Task: Added durable context files for continuing POS implementation without losing architectural decisions.
- Files added or changed: `.agent/pos-context.md`, `.agent/next-steps.md`, `docs/auth-architecture.md`, `.agent/devlog.md`.
- Important decisions recorded: cloud identity and local hub auth are separate layers; the hub issues local offline device sessions from synced cloud enrollment/roles.
- Follow-up notes: Convex dev deployment should be set up before implementing cloud auth and sync ingestion beyond placeholders.

## 2026-05-09

- Task: Switched planned cloud identity to WorkOS AuthKit with Google sign-in only and wired the cloud-admin AuthKit/Convex scaffold.
- Files added or changed: `convex.json`, `convex/auth.config.ts`, `convex/viewer.ts`, `apps/cloud-admin/*`, `docs/workos-authkit-setup.md`, `.env.example`, context docs.
- Important modules: `ConvexClientProvider` bridges AuthKit tokens into Convex using `ConvexProviderWithAuth`; `viewer.get` confirms authenticated Convex identity.
- Follow-up notes: Google-only is enforced in the WorkOS Dashboard by enabling Google and disabling all other AuthKit methods. `pnpm exec convex dev --once` currently stops because Convex-managed WorkOS provisioning must be completed in an interactive terminal.

## 2026-05-09

- Task: Built the first usable application pass across the monorepo: Windows hub API/UI, Electron shell, Expo Android shell, Convex HTTP sync boundary, and cloud admin dashboard shell.
- Hub additions: catalog/setup APIs for floors, tables, production units, and menu items; KDS status updates; table active-order lookup; order detail lookup; print queue listing/retry; sync status and manual sync push route; static cashier/admin UI served by the hub; Electron desktop entrypoint.
- Mobile additions: Expo/React Native app with hub URL setting, health polling, table list, menu/order entry, AsyncStorage draft persistence, offline draft behavior, and hub-confirmed KOT submit.
- Cloud additions: AuthKit/Convex dashboard shell for restaurant identity, sync/fleet/reporting surfaces; Convex HTTP action at `/pos/ingest-events` protected by `POS_SYNC_SECRET`.
- Verification: `pnpm test` passed with 8 hub tests; `pnpm typecheck` passed for shared, hub, cloud-admin, and mobile; `pnpm exec tsc -p convex/tsconfig.json` passed; `pnpm lint` passed; local hub smoke test opened a POS day, submitted an order, read KDS, generated/settled a bill, and processed print jobs.
- Superseded note: initial smoke print processing left bill print failed because no receipt printer existed yet; this was fixed later the same day with receipt-printer hub settings and bill routing.

## 2026-05-09

- Task: Closed the major leftovers from the first usable pass: local hub auth, pairing, receipt printer configuration, and broader tests.
- Hub additions: `AuthService`, local device table, pairing-code table, role-protected REST routes, token-protected realtime WebSocket, receipt printer hub settings, receipt print routing for bills, pairing-code and receipt-printer controls in the hub UI.
- Mobile additions: saved device token, pairing-code exchange, token-authenticated hub client.
- API hardening: SQLite-backed idempotency records for order submit, KOT reprint, bill generation, and settlement; request-body hash rejects mismatched idempotency key reuse.
- Test additions: auth service tests, Fastify API integration tests, duplicate idempotent order submission tests, Convex sync bridge tests, receipt-printer bill print routing test.
- Verification: hub test suite now has 20 tests; protected-route smoke test confirmed unauthenticated bootstrap returns 401, admin token works, receipt printer config works, order/bill/print flow finishes with `printed: 2, failed: 0`.

## 2026-05-09

- Task: Added cross-workspace tests so `pnpm test` covers shared validation/money helpers and the mobile LAN hub client, not only the hub runtime.
- Test additions: `packages/shared/src/tests/money-and-schemas.test.ts`, `apps/mobile/src/tests/hub-client.test.ts`.
- Verification: `pnpm test` now runs 25 tests total: 20 hub, 3 shared, 2 mobile. `pnpm typecheck`, Convex TypeScript check, and `pnpm lint` pass.

## 2026-05-09

- Task: Made the hub ready for local hands-on use from the browser.
- UI additions: setup forms for floors, tables, production units, menu items, receipt printer, and pairing codes; POS day close form; KOT reprint button; bill reprint button.
- API/domain additions: bill reprint route and service method.
- Verification: `pnpm test`, `pnpm typecheck`, Convex TypeScript check, and `pnpm lint` pass; hub is running in dry-run printer mode at `http://127.0.0.1:3737` and LAN `http://192.168.1.202:3737`.

## 2026-05-09

- Task: Responded to UI/printer critique by closing running apps, replacing the crammed hub surface with a four-view workflow, and adding PC-installed printer selection.
- UI changes: Setup, Service, Kitchen, and Billing screens now separate setup from live operations. Setup is step-based: business day, printers, rooms/tables, kitchens/menu, devices.
- Printer changes: added OS/system printer discovery via `/system-printers`, printer-name storage on receipt printer and production units, print-job `printer_name`, and a routed printer adapter that prints to selected system printers or falls back to LAN ESC/POS.
- Verification: `pnpm test`, `pnpm typecheck`, Convex TypeScript check, and `pnpm lint` pass. No dev apps remain running.

## 2026-05-09

- Task: Added Drizzle ORM setup and wired the hub runtime to use the Drizzle database handle.
- Files added or changed: `apps/hub-electron/src/db/drizzle-schema.ts`, `apps/hub-electron/drizzle.config.ts`, generated `apps/hub-electron/drizzle/*`, `HubDatabase`, `AuthService`, `PrintJobService`, `ConvexSyncBridge`, API idempotency middleware, runtime/tests, and context docs.
- Important modules: `HubDatabase.orm` is the shared Drizzle handle; `drizzle-schema.ts` mirrors the local SQLite schema; `db:generate` and `db:studio` are available in the hub package.
- Reusable pieces: use Drizzle query builder for new SQLite access; keep `schema.ts` raw migrations and Drizzle schema synchronized until migration ownership is formally switched.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron db:generate`, and `pnpm --filter @gaurav-pos/hub-electron test` pass.
- Follow-up notes: `OrderService` is now constructed from the Drizzle handle, but its complex KOT/billing transaction internals still use prepared SQLite statements through Drizzle's owned client. Convert that module in small tested slices rather than in one risky rewrite.

## 2026-05-09

- Task: Implemented the remaining non-hardware production-readiness work from the current checklist.
- Files added or changed: `BackupService`, backup API/UI/tests, close summary/menu edit/device revoke UI, Convex installation and hub command sync, Windows Electron Builder config, `docs/windows-hub-runbook.md`, `docs/cloud-sync-installations.md`, `.env.example`, and context files.
- Important modules: `apps/hub-electron/src/db/backup-service.ts`, `ConvexSyncBridge.pullCloudSnapshot`, `convex/sync.ts` installation/command functions, `OrderService.getCloseSummary`, `OrderService.updateMenuItem`.
- Reusable pieces: use hub commands for cloud-to-hub changes; use backup service for manual backup and restart-based restore rather than copying an open SQLite file.
- Verification: `pnpm test`, `pnpm typecheck`, `pnpm exec tsc -p convex/tsconfig.json`, `pnpm lint`, hub build, and local hub smoke checks passed.
- Follow-up notes: Real printer output and restaurant-specific tax/service-charge rules still require the user/hardware environment. `package:win` is configured but cannot complete on macOS because `better-sqlite3` is native and node-gyp refuses Windows cross-compilation; run it on the Windows hub PC or Windows CI.

## 2026-05-09

- Task: Added a junior-friendly architecture guide with updated flowcharts.
- Files added or changed: `docs/architecture-junior-guide.md`, `.agent/reuse-map.md`, `.agent/devlog.md`.
- Important modules documented: Windows hub, SQLite/Drizzle, LAN REST/WebSocket, local auth, KOT/print flow, Convex sync, backups, Windows packaging.
- Follow-up notes: Keep this guide updated whenever the architecture changes so future implementation stays aligned.
