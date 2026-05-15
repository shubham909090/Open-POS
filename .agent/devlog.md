# Devlog

## 2026-05-16

- Task: Polished the mobile APK role experience and added the missing kitchen-device flow.
- APK behavior: phones paired as kitchen now open a dedicated KDS screen with enabled counters, active ticket cards, item quantities, and Start / Ready / Served status actions. Waiter/captain transfer targets continue to include running active tables with clearer target status labels.
- APK polish: Android top spacing now has a fallback safe-area inset so the header does not bleed into the status bar on devices where Expo does not report `StatusBar.currentHeight`.
- Verification: mobile tests, mobile typecheck/lint, and `git diff --check` passed.

## 2026-05-16

- Task: Added bulk CSV import for menu dishes and alcohol catalog items.
- Backend: new admin-only CSV import endpoints create normal dishes, plain liquor stock, and prepared alcohol products while returning per-row success/error results.
- Hub UI: Setup > Dishes and Alcohol > Add Alcohol Item now have compact CSV import panels with downloadable templates, file upload, import status, and row-level error summaries. Follow-up polish removed extra visible explanation copy and fixed setup/import/transfer buttons that were inheriting the heavy black global button style.
- Verification: import API tests, hub typecheck/lint, renderer build, and `git diff --check` passed.

## 2026-05-16

- Task: Started the POS UI/UX rescue pass across Hub and APK operational flows.
- Hub changes: added `.agent/ui-ux-rescue-plan.md`, made KDS respect `kds_enabled`, added full-table transfer into running target tables, replaced the shift panel with full/partial transfer controls, stabilized recent-menu tracking, improved table/button contrast, collapsed saved cloud/printer forms, hid backup UI from normal Reports, removed kitchen routing from Sale & Tax Categories, added role cards to device pairing, and expanded current/closed reports with payment/category/bill/item detail.
- APK changes: transfer targets now include active running tables, and transfer copy/buttons show full table vs selected quantity behavior.
- Verification: Hub typecheck/lint/tests passed, mobile typecheck/lint/tests passed, and targeted order/store tests passed after the final UI edits.
- Follow-up notes: Split-payment polish, printer hardware boldness validation, full dashboard visual review, and user visual sign-off remain open in the tracker.

## 2026-05-16

- Task: Corrected the first visible polish regressions from the rescue UI pass.
- Hub UI fixes: role cards no longer inherit the global black button style, topbar refresh no longer renders as a black square, printer test actions are compact secondary buttons, menu/alcohol variant buttons now fill stable cells instead of cramming into 44px, and report payment/detail grids collapse correctly in nested closed-day rows.
- Verification: Hub typecheck, hub lint, targeted hub tests, `git diff --check`, and hub renderer build passed.

## 2026-05-16

- Task: Fixed transfer/menu/support polish issues caught during visual review.
- Hub UI fixes: item transfer rows now use a minus/input/plus quantity control and clamp to the available quantity, single-dish add buttons center the plus icon, and Advanced support tools use compact utility styling instead of oversized black primary buttons.
- Verification: Hub typecheck, hub lint, targeted hub tests, hub renderer build, and `git diff --check` passed.

## 2026-05-16

- Task: Added the missing running-table operational shortcuts in the Hub Take Orders table rail.
- Hub behavior: table rows in bootstrap now include live order total and sent item count, computed from active order items and tax components.
- Hub UX: running and bill-printed table tiles now show the live rupee total and expose direct Sent and Bill shortcuts, opening the selected table directly in the sent-items or billing tab.
- Verification: `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron build:renderer`, and `git diff --check` passed.

## 2026-05-16

- Task: Reduced setup/report clutter and fixed utility button presentation.
- Hub UX: Transfer table/items is collapsed by default. Setup sections now collapse when already ready and auto-collapse after save; Business Day is just a compact summary; printer layout templates are tucked behind a nested collapsible control.
- Hub polish: support tools, print-test buttons, and alcohol tabs use tighter utility/segmented styling. Reports now use a one-column layout, compact business-day metadata, and Load more pagination for closed reports, bill details, item summaries, and alcohol stock movements.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron build:renderer`, and `git diff --check` passed.

## 2026-05-15

- Task: Fixed Android mobile header overlap with the system status bar.
- Files added or changed: `apps/mobile/src/lib/safe-area.ts`, `apps/mobile/src/tests/safe-area.test.ts`, `apps/mobile/src/App.tsx`.
- Important behavior: Android now reserves `StatusBar.currentHeight` at the app shell and QR scanner shell before rendering headers, while iOS keeps using its native safe-area handling.
- Verification: mobile safe-area test and mobile typecheck passed.

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
- Reusable pieces: use Drizzle query builder for SQLite access. This note is superseded by the later full-send Drizzle migration entry; `schema.ts` raw migrations were removed.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron db:generate`, and `pnpm --filter @gaurav-pos/hub-electron test` pass.
- Follow-up notes: superseded by the later full-send Drizzle migration entry; the write-heavy KOT/billing mutation path was converted to Drizzle query APIs.

## 2026-05-10

- Task: Went full-send on Drizzle because no production hub database exists yet.
- Files changed: removed `apps/hub-electron/src/db/schema.ts`, switched `HubDatabase.migrate()` to `drizzle-orm/better-sqlite3/migrator`, added `drizzle/**/*` to Electron package files, and converted `OrderService` write-heavy service-hour mutation clusters to Drizzle query APIs.
- Important behavior: Drizzle migrations are now the startup migration source of truth. Order/KOT/billing writes still run inside local SQLite transactions, but the inserts/updates/select helpers now target the Drizzle schema directly.
- Verification: hub typecheck and hub test suite passed after the conversion.

## 2026-05-10

- Task: Audited Convex usage against installed Convex AI guidelines and current official Convex AuthKit docs.
- Fixes: replaced the custom cloud-admin Convex auth bridge with `ConvexProviderWithAuthKit` from `@convex-dev/workos`, bounded remaining Convex admin queries with `.take(100)`, removed redundant in-memory filtering after indexed queries, and capped hub event ingestion batches at 100 events.
- Verification: `pnpm exec tsc -p convex/tsconfig.json` and `pnpm --filter @gaurav-pos/cloud-admin typecheck` passed.

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

## 2026-05-10

- Task: Added basic manual restaurant payment settlement.
- Files added or changed: shared payment schemas/types, bill/payment migrations and Drizzle schema, `OrderService.settleBill`, bill ticket rendering, hub billing UI, order-service tests, and architecture/context docs.
- Important behavior: bills now support discount, tip, final total, multiple cashier-entered payment rows, cash/UPI/card/online methods, payment references, and remaining-balance tracking. The bill is marked paid only when entered payments cover the final total.
- Verification: `pnpm test`, `pnpm typecheck`, `pnpm exec tsc -p convex/tsconfig.json`, `pnpm lint`, and hub build passed.
- Follow-up notes: This is manual recording only; no payment gateway/API verification is included or intended.

## 2026-05-10

- Task: Finished the next urgent non-hardware gaps around QR/barcode pairing, cloud setup, mobile order flow, and edge tests.
- Hub additions: pairing-code API now returns a Gaurav POS QR payload, payload text, and QR PNG data URL; hub Setup shows the scan-ready QR plus numeric fallback. `HUB_PUBLIC_URL` can force QR payloads to use the Windows PC LAN URL instead of `localhost`.
- Mobile additions: `expo-camera` QR scanner, manual QR payload paste fallback, hub URL auto-fill from pairing QR, and a final KOT review prompt before online submission.
- Cloud additions: authenticated Convex admin functions and Next.js UI for restaurant creation, installation identity registration, installation/event views, and cloud-to-hub command queueing. Added `memberships` to the Convex schema and locked admin cloud mutations to WorkOS/Convex authenticated restaurant admins.
- Test additions: API pairing QR assertions, print retry exhaustion test, and unpaid-bill POS day close guard test.
- Verification: hub tests passed with 28 tests; mobile typecheck, cloud-admin typecheck, and Convex TypeScript check passed. `pnpm exec convex codegen` still requires `WORKOS_CLIENT_ID` in the Convex deployment, so `convex/_generated/api.d.ts` was manually updated for the new `admin` module until env setup is complete.

## 2026-05-10

- Task: Started the production UI cleanup device by device instead of leaving all controls crammed together.
- Hub UI: improved the Windows hub surface with operational stats, better service/table/ticket layout, clearer billing context, menu search, draft totals, and toast feedback.
- Android UI: reshaped the waiter app into a device-friendly flow: hub/pairing controls, table grid, order panel, menu search, ticket total, and a clear Send KOT/Save Draft action.
- Cloud admin UI: rebuilt the dashboard into Setup, Menu & Devices, and Sync Health sections with step-based restaurant/hub setup, guided command fields, installation health, event timeline, and command preview.
- Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm exec tsc -p convex/tsconfig.json`, `pnpm --filter @gaurav-pos/hub-electron build`, and `git diff --check` passed. No hub server remains running on port 3737.

## 2026-05-10

- Task: Added staff invitation/member management and richer day-close cash reconciliation.
- Cloud additions: Convex `memberInvitations`, authenticated invite/accept/list/update/remove/revoke functions, and cloud-admin Staff tab for email-based Google invitations, member role updates, member removal, and invite revoke.
- Hub additions: `OrderService.getCloseSummary` now returns opening cash, gross/final bill totals, discounts, tips, method-wise payments, total/non-cash payments, expected closing drawer cash, paid bill count, unpaid bill count, and open-order blockers; hub UI calculates typed closing-cash variance live.
- Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm exec tsc -p convex/tsconfig.json`, `pnpm --filter @gaurav-pos/hub-electron build`, and `git diff --check` passed.

## 2026-05-10

- Superseded: An earlier dish-customization catalog experiment was removed on 2026-05-11 when the product was reset to simple dishes and table billing.

## 2026-05-11

- Task: Audited important auth/authorization pathways before dev testing.
- Convex hardening: hub installation registration now requires restaurant owner access, trims installation id/secret, and blocks reassigning an existing installation id to another restaurant. Event ingestion now requires installation identity, maps restaurant id server-side, and no longer accepts unmapped/global-secret uploads. Invitation revoke now only applies to pending invitations.
- Hub hardening: kitchen devices can still access KDS/KOT status paths, but can no longer read full table-order or order-detail endpoints. Waiter/cashier/admin roles keep those reads.
- Test additions: API integration test confirms a paired kitchen device is blocked from full order reads while still allowed to load KDS.
- Verification: hub test suite, full workspace typecheck, Convex TypeScript check, and lint passed.

## 2026-05-11

- Task: Reworked beginner onboarding and removed raw technical wording from the main cloud/hub flows.
- Cloud UI: Owner Portal setup is now Create Restaurant -> Connect the hub PC -> Start the hub app -> Confirm sync -> Invite staff. Hub connection generation creates the internal hub ID/secret automatically and shows a copyable env block; manual connection details and raw support commands live in Advanced.
- Hub UI: setup is now a guided checklist for unlocking the hub, opening today's POS day, choosing the cash counter printer, adding kitchens/counters, adding tables, adding dishes, pairing devices, and starting service. Reports & Backups and Advanced now hold backup/reconciliation and cloud update tools instead of cramming everything into Setup.
- Domain/API behavior: shared create schemas accept optional support-only `customId`; hub catalog creation generates IDs by default, retries generated collisions, and returns a friendly duplicate custom-ID error.
- Verification: `pnpm exec convex codegen`, `node --check apps/hub-electron/src/public/app.js`, hub tests, full workspace typecheck, and lint passed.

## 2026-05-11

- Task: Fixed confusing hub unlock failure after the user set real env values.
- Root cause: changing `HUB_ADMIN_TOKEN` did not rotate the existing `device-local-admin` token hash in the dev SQLite DB because admin seed used insert-ignore. The browser could also keep an old `dev-admin-token` in localStorage.
- Fix: hub startup now upserts the local admin device token when `HUB_ADMIN_TOKEN` changes, and the hub UI now shows a friendly locked state asking for the current hub password instead of leaving `Invalid or revoked device token` in the side panel.
- Verification: hub UI JS syntax check, hub tests, full workspace typecheck, and lint passed.

## 2026-05-11

- Task: Cleaned up secret-entry UX and responsive breakpoints after user testing.
- Hub UI: removed the duplicate password field from the sidebar, kept hub unlock only in Setup step 1, added Show/Hide for the hub password, added success feedback after unlock, and tightened small-screen form/grid behavior.
- Cloud UI: advanced existing-connection secret now has Show/Hide and no longer clears after save; success copy tells the user to reuse the same values in the hub PC env file.
- Verification: hub UI JS syntax check, hub tests, full workspace typecheck, and lint passed.

## 2026-05-11

- Task: Reset the hub product to the restaurant basics: simple dish setup, visible CRUD lists, table-based ordering, and bill settlement from the selected table.
- Removed: the previous dish-customization catalog, its price snapshots, KOT text, UI, Android UI, seed data, and tests.
- Hub behavior: dishes now have only name, price, optional kitchen/counter, and active status. Dishes without a kitchen can be sold and billed, but do not create KOTs. Sending to kitchen clears only the new draft; already-sent table items stay visible. Bill settlement supports amount/percent discount, tip, full cash/UPI/card/online buttons, split/custom payment rows, paid bill print, and table release.
- Setup UX: kitchens/counters, rooms/tables, dishes, and paired devices now show visible lists after saving, with inline edit/disable/remove controls where safe.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm exec tsc -p convex/tsconfig.json`, `pnpm build`, hub UI JS syntax check, `git diff --check`, and a fresh SQLite smoke path for no-kitchen dish -> no KOT -> bill -> paid settlement -> table free all passed.

## 2026-05-11

- Task: Polished the Android waiter app to match the simplified POS flow.
- Mobile UX: app is now organized into clear Setup, Tables, Menu, and Ticket sections; setup is hidden once connected; hub password has Show/Hide; offline/draft/open-day states explain what is happening; table picker, menu search, and ticket views have empty states.
- Mobile behavior: already-sent table items are read-only context and are no longer loaded into the new draft, preventing accidental re-send. New items clear after Send To Kitchen while the table check remains visible.

## 2026-05-11

- Task: Fixed broken hub setup removal behavior.
- Hub runtime: removed automatic demo seeding from real hub startup, so a fresh local DB starts with no fake Main room, T1-T4 tables, kitchens, or placeholder dishes.
- Hub setup CRUD: unused dishes now really delete; used dishes disable to preserve history. Rooms, tables, kitchens/counters, and dishes now all show Enable/Disable controls when they are disabled.
- UX behavior: remove actions now show whether the row was removed or disabled because it already had history.

## 2026-05-11

- Task: Audited env placement between Convex, cloud web, and local hub.
- Result: Convex dev deployment now only has `WORKOS_CLIENT_ID` and `WORKOS_API_KEY`, which are the WorkOS/AuthKit values Convex needs. Removed misplaced `WORKOS_COOKIE_PASSWORD` from Convex; it belongs to the Next.js/cloud-web environment.
- Local env audit: root `.env.local` has no duplicate keys and includes the needed local web and local hub values. `POS_INSTALLATION_ID` and `POS_SYNC_SECRET` are hub-local envs whose matching values are stored in Convex installation records, not Convex deployment env vars.
- Docs updated: `docs/workos-authkit-setup.md`, `docs/auth-architecture.md`, and `docs/cloud-sync-installations.md` now describe the correct placement.

## 2026-05-11

- Task: Repaired the hub setup journey after hands-on testing exposed unclear blocking states.
- Hub behavior: bootstrap now exposes whether printer dry-run mode is enabled. In dry-run development, setup can continue without connected printers. In production mode, the cash-counter printer/IP remains a required step.
- Hub UX: Ready For Service now lists every missing required step with plain instructions instead of a generic blocked message. Protected modes show the first exact missing requirement in the toast. Successful setup actions advance to the next required step.
- Product rule: pairing waiter/kitchen devices is useful but optional for starting service from the hub PC, so it no longer blocks Take Orders.
- Verification: hub UI JS syntax check, hub tests, and hub typecheck passed.

## 2026-05-11

- Task: Rebuilt hub state/UI around server-confirmed state and added real cloud daily reports.
- Hub renderer: added a Vite + React + TypeScript frontend served by the existing Fastify/Electron hub. TanStack Query owns hub API/server state; Zustand owns only UI state like selected table, active view, and per-table new-item drafts. Order/KOT/bill mutations are pessimistic: buttons lock during requests, then refetch from the hub before showing the final state.
- Hub daily close: close now freezes a `daily_report.finalized` snapshot with cash reconciliation, bill totals, payment split, bill summaries, and item summaries; stores it locally in SQLite; queues it through `event_log`/`sync_outbox`; and tries cloud sync after close without blocking offline close.
- Cloud reporting: Convex now materializes finalized report events into `dailyReports`, `dailyReportBills`, and `dailyReportItems`; read queries allow owner/admin/reporting users to view daily reports and details. The Owner Portal now has a real Reports tab with sales, payments, cash variance, bill rows, and item rows.
- Verification: `pnpm typecheck`, `pnpm test`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/cloud-admin exec dotenv -e ../../.env.local -- next build`, and a temp-DB hub smoke path (setup -> order -> bill -> close -> local report) passed.
