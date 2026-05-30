# Devlog

## 2026-05-30

- Hub one-click online updates: replaced the primary Advanced app-update UI with one `Update app` action backed by `electron-updater`, added online update state to Hub status, and added `/system/update/online/install` for admin-only check/download/backup/install without local zip/exe baseline setup.
- Update safety: online install blocks running orders, runs DB integrity check, creates a pre-update SQLite backup, then calls Electron updater install/restart. Existing custom `.gpos-update.zip` validation remains as fallback/release packaging support.
- Release packaging/docs: Hub Windows NSIS now builds one-click per-user installers, publishes GitHub updater metadata for `shubham909090/Open-POS`, release helpers keep/upload `latest.yml`, installer `.exe`, `.exe.blockmap`, and fallback `.gpos-update.zip`, and update docs now describe the one-click path.
- Reference: cloned `pingdotgg/t3code` to `/Users/shubhamtemak/Documents/ExampleRepos/t3code` and used its `electron-updater` + GitHub Releases metadata pattern.
- Verification: targeted updater tests, full Hub test suite, Hub typecheck, and non-bumping release build `pnpm release:hub:fresh -- --version 0.1.8 --skip-tests` passed; release folder contains `latest.yml`, `.exe`, `.exe.blockmap`, and `.gpos-update.zip`.

## 2026-05-24

- POS cloud licensing pass started: added `.agent/pos-cloud-licensing-plan.md` and `.agent/pos-cloud-licensing-context.md`.
- Decisions captured: backup rows only, no cloud report source, one setup key, one hub activation, Master-PIN restore gate, temp restore backup cleanup, admin-only command center, and removal of raw cloud support commands.
- Convex: added platform admin guard, license key/activation/check tables, generic backup row/manifests tables, activation/license-check/backup/restore HTTP endpoints, and made old `/pos/ingest-events` a no-op compatibility endpoint.
- Hub: replaced raw event upload with bounded cloud backup row scanning on the existing sync tick, stopped adding new `sync_outbox` rows, added license activation/check/offline-lock state, and added cloud restore with Master PIN, open-table blocker, temp rollback backup, domain wipe/import, report rebuild, FK check, and integrity check.
- UI: replaced the cloud owner/report portal with a platform command center, added hub setup-key activation/license status and cloud restore controls, and added mobile license lock/warning rendering from bootstrap.
- Performance: extended `hub-load-probe` with `cloud_backup.batch100`; latest run showed 100 backup rows scanned/pushed in 24.27 ms.
- Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @gaurav-pos/cloud-admin build`, `pnpm --filter @gaurav-pos/hub-electron build`, and `pnpm --filter @gaurav-pos/hub-electron perf:load` passed.
- Review hardening: hub service APIs now enforce locked/missing licenses server-side for paid builds (`BUILD_LICENSE_REQUIRED=true`) and for locked leases; license/setup recovery endpoints remain reachable.
- Review hardening: order-history restore now pulls floor/table and menu/catalog dependency rows without date filters, then date-filters only the real history rows through the selected business date.
- Review hardening: old Convex raw event/report ingest no longer writes `syncedEvents` or `dailyReport*`; old support-command functions no longer enqueue or return cloud commands; activation re-enable keeps one-active-hub.
- Review hardening: `DEV-SHA256` leases require explicit dev env plus a matching secret, while production signing fails closed without `POS_LICENSE_PRIVATE_KEY_PEM`.
- Review hardening verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, targeted hub license/restore tests, Convex tests, and isolated perf smoke passed.
- Review hardening 2: moved paid hub license strictness/public verification to build-time constants, generated and rotated RSA license keys, set the Convex private signing env on `dev:fine-camel-186`, and updated the brother env setup doc so `hub.env` no longer carries license policy. RSA verification now requires the packaged public key option instead of reading `POS_LICENSE_PUBLIC_KEY_PEM` from the process environment.
- Review hardening 2: added cloud backup tombstones for replaced payments and unused catalog/layout hard deletes, pushed tombstones before sweeper rows, streamed restore page imports, kept suspended activations visible in command center, and removed old raw cloud event/report/support-command schema/helper files.
- Review hardening 2 verification: targeted hub/Convex tests passed, hub/cloud/mobile typechecks/builds passed, and `pnpm --filter @gaurav-pos/hub-electron perf:load` passed with `cloud_backup.batch100` at 13.25 ms.

## 2026-05-20

- Hub CSS feature split: moved printer setup styles from root `apps/hub-electron/src/renderer/styles.css` into `apps/hub-electron/src/renderer/styles/printer.css` and app update styles into `apps/hub-electron/src/renderer/styles/app-update.css`.
- Depth: renderer styling now has better Locality for printer and updater work; agents can inspect focused style Modules instead of loading one large root stylesheet.
- Impact: `apps/hub-electron/src/renderer/styles.css` dropped from 1553 to 1209 lines; new CSS Modules are 221 and 121 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/app-update-panel.test.tsx src/tests/bill-printer-chooser.test.tsx` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Hub settings action split: moved Manager/Master PIN setup/session unlock, hub connection setting reads/writes, ticket-template commands, and print-layout reads/writes into `apps/hub-electron/src/domain/order-service/settings-actions.ts`.
- Depth: hub settings behaviour now sits behind one Module Interface over the existing pure setting models; `OrderService` keeps public facade plus shared approval, setting write, production-unit validation, and event seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 1585 lines; new settings action Module is 157 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Print settings action split: moved bill-printer profile reads/writes, receipt/bill printer updates, printer output mode commands, bill-printer resolution, and test bill/KOT print enqueue into `apps/hub-electron/src/domain/order-service/print-settings-actions.ts`.
- Depth: printer setup and test-print behaviour now sits behind one Module Interface; `OrderService` keeps public facade plus shared setting, print-layout, event, and enqueue seams used by billing flows.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 1619 lines; new print settings action Module is 164 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Alcohol action split: moved alcohol catalog/storage read entrypoints, alcohol create/import/update commands, manual stock adjustment, and stock movement list entrypoint into `apps/hub-electron/src/domain/order-service/alcohol-actions.ts`.
- Depth: alcohol commands now keep CSV coercion, variation/recipe orchestration, base menu-item creation/update, stock adjustment approval routing, movement recording, and alcohol event writes behind one Module Interface; shared low-level stock/recipe helpers remain reusable for bill settlement and history edit flows.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 1683 lines; new alcohol action Module is 276 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Menu item action split: moved dish/menu create, CSV import, update, active toggle, delete, manager/master-approved delete, and bulk delete into `apps/hub-electron/src/domain/order-service/menu-item-actions.ts`.
- Depth: menu item commands now keep custom-ID generation, default variant writes, CSV row coercion, usage-based soft delete, alcohol reference cleanup, approval routing, and event writes behind one Module Interface; `OrderService` keeps list/read and alcohol orchestration seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 1848 lines; new menu item action Module is 219 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Setup catalog action split: moved sale group, floor, table, and kitchen/counter create/update/remove commands into `apps/hub-electron/src/domain/order-service/setup-catalog-actions.ts`.
- Depth: setup catalog commands now keep ID generation, sort-order defaults, usage-based soft delete, validation, and event writes behind one Module Interface; `OrderService` keeps list/bootstrap/public service seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 1987 lines; new setup catalog Module is 232 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split. First test run caught a duplicate custom-ID message drift; fixed to preserve the existing Interface contract.

- Bill action split: moved manager-approved bill reprint, history reprint, printed-bill revision, owner history edit, NC marking, and first-print flow into `apps/hub-electron/src/domain/order-service/bill-actions.ts`.
- Depth: bill correction and print actions now sit behind one workflow Module Interface; `OrderService` keeps the public service Interface and shared billing, print, report, stock, and event seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2128 lines; new action Module is 370 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Order state update split: moved captain order-state edit, billed-order manager-approved edit, printed KOT-on-save, bill revision, empty-billed-order bill removal, and table status writes into `apps/hub-electron/src/domain/order-service/order-state-update.ts`.
- Depth: open/billed order-state editing now has one workflow Module Interface; `OrderService` keeps the public service Interface and shared item, bill, KOT, and event seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2296 lines; new update Module is 191 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Bill lifecycle split: moved bill generation, settlement payment validation, settlement write flow, print enqueue, table release, and billing lifecycle events into `apps/hub-electron/src/domain/order-service/bill-lifecycle.ts`.
- Depth: bill generate/settle behaviour now sits behind one lifecycle Module Interface; `OrderService` keeps the public service Interface, shared bill revision/history actions, and event/outbox seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2351 lines; new lifecycle Module is 206 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Order lifecycle split: moved submit order, cancel order, cancel item, order actor input, edit-role check, table occupancy writes, cancellation KOT changes, and order lifecycle events into `apps/hub-electron/src/domain/order-service/order-lifecycle.ts`.
- Depth: live order submit/cancel behaviour now sits behind one lifecycle Module Interface; `OrderService` keeps the public service Interface and shared transaction/event seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2457 lines; new lifecycle Module is 221 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- OrderService transfer/item normalization split: moved table transfer, full-table-to-occupied-table transfer, partial item transfer, matching item snapshot logic, and transfer event/KOT writes into `apps/hub-electron/src/domain/order-service/table-transfer.ts`. Moved submitted order-item normalization for menu items, variants, open items, note trimming, price-edit approval, and preserved item snapshots into `submitted-items.ts`.
- Depth: table/item shifting now sits behind one transfer Module Interface, and submitted item normalization is one shared Interface used by submit, order-state edit, bill revision, and history edit paths. `OrderService` keeps transaction orchestration and event seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2581 lines; new Modules are 322 and 100 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- OrderService test split: moved the former 3103-line `apps/hub-electron/src/tests/order-service.test.ts` suite into focused KOT, billing, history, alcohol, and transfer files; the old path is now a skipped index so targeted commands still resolve cleanly.
- Depth: test intent now has better Locality by workflow, so agents can inspect the relevant behaviour without loading one giant fixture file.
- Impact: largest focused OrderService test file is now `apps/hub-electron/src/tests/order-service-billing.test.ts` at 806 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (32 files passed / 1 skipped, 264 tests passed / 1 skipped), and `git diff --check` passed after this split.

- API server test split: moved the former 2256-line `apps/hub-electron/src/tests/api-server.test.ts` suite into focused auth/settings, order/billing, realtime/roles, print/catalog/report, and idempotency files, with shared test server helpers in `api-server-helpers.ts`.
- Depth: route coverage now follows API Module boundaries, so auth, realtime, printing, and idempotency changes no longer require loading one giant integration suite.
- Impact: largest focused API test file is now `apps/hub-electron/src/tests/api-server-auth-settings.test.ts` at 584 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/api-server.test.ts` (36 files passed / 3 skipped, 264 tests passed / 3 skipped), and `git diff --check` passed after this split.

- Print reprint/queue split: moved KOT reprint query/render/enqueue, bill reprint query/render/print-count update, print-job enqueue, and print-job retry reset to `apps/hub-electron/src/domain/order-service/reprint-tickets.ts` and `apps/hub-electron/src/domain/order-service/print-job-records.ts`.
- Depth: print payload SQL and print-job persistence now sit behind focused Module Interfaces; `OrderService` keeps approval, adjustment, and event Locality.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2856 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (28 files / 264 tests), and `git diff --check` passed after this split.

- Order item/KOT creation split: moved order-item diff writes, snapshot diff-key hashing, order-item KOT change projection, KOT grouping, KOT row/item inserts, KOT ticket rendering, optional print enqueue, and `kot.created` event append callout to `apps/hub-electron/src/domain/order-service/order-item-diff.ts` and `apps/hub-electron/src/domain/order-service/kot-creation.ts`.
- Depth: order mutation workflows keep the transaction and service-hour decisions in `OrderService`; item diff and KOT creation Modules now hide write detail behind narrow Interfaces, improving Locality for KOT/order bugs.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 2982 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (28 files / 264 tests), and `git diff --check` passed after this split.

- Bill payment record split: moved paid amount aggregation, paid-bill payment reallocation, owner history-edit payment replacement, local bill deletion, and bill adjustment writes to `apps/hub-electron/src/domain/order-service/bill-payment-records.ts`.
- Depth: bill/payment persistence rules now sit behind one payment-record Module Interface; `OrderService` keeps bill workflow orchestration, table release, print, and event/outbox Locality.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3264 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (28 files / 264 tests), and `git diff --check` passed after this split.

- Alcohol catalog/stock split: moved alcohol catalog read model, recipe snapshots, plain-liquor resolver, recipe CSV parsing, variation/recipe validation, variation/recipe replacement, storage read model, stock movement listing, stock guards/writes, and movement recording to `apps/hub-electron/src/domain/order-service/alcohol-catalog.ts` and `apps/hub-electron/src/domain/order-service/alcohol-stock.ts`.
- Depth: `OrderService` keeps service-hour transaction orchestration and event/outbox appends; alcohol catalog/stock Modules now hide SQL shape and stock mutation details behind smaller Interfaces with better Locality.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3336 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (28 files / 264 tests), and `git diff --check` passed after this split.

- Sale-group catalog split: moved sale-group list read model, active lookup guard, and CSV/reference resolver to `apps/hub-electron/src/domain/order-service/sale-group-catalog.ts`.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3553 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (28 files / 264 tests), and `git diff --check` passed after this split.

- Floor/table catalog split: moved table/floor list read models, table/floor lookup guards, and next-sort-order helpers to `apps/hub-electron/src/domain/order-service/floor-table-catalog.ts`.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3572 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts` (28 files / 264 tests), and `git diff --check` passed after this split.

- Menu catalog split: moved menu list read model, current-day popularity query, variant listing, menu-item snapshot lookup, variant resolution/defaulting, and default-variant update helper to `apps/hub-electron/src/domain/order-service/menu-catalog.ts`.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3602 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts`, and `git diff --check` passed after this split.

- Billing/day lifecycle split: moved bill total/tax calculation plus `order_items.tax_paise` writes to `apps/hub-electron/src/domain/order-service/bill-totals.ts`. Moved business-day creation, completed-day finalization, daily snapshot creation, and snapshot refresh to `business-day-lifecycle.ts`.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3707 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts`, and `git diff --check` passed after this split.

- Billing print/read-model split: moved receipt bill ticket construction, printable tax breakdown, and receipt layout projection to `apps/hub-electron/src/domain/order-service/bill-ticket-model.ts`. Moved active order total/item/timer summaries to `order-service/read-models.ts`. `OrderService` now keeps enqueue/orchestration while ticket shape and read-model query shape sit behind smaller seams.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3868 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts`, and `git diff --check` passed after this split.

- Hub query split: moved production-unit projections/lookup requirements to `apps/hub-electron/src/domain/order-service/production-unit-queries.ts`, ready KOT notification creation/listing to `ready-notifications.ts`, and sync status projection to `read-models.ts`. `OrderService` keeps mutation orchestration and event emission, but more read-shape/query details now live behind focused helpers.
- Print seam: moved pure bill/KOT test-print payload construction to `apps/hub-electron/src/domain/order-service/print-test-payloads.ts`, leaving `OrderService` responsible for printer resolution, enqueue, and events.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped further to 3995 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts`, and `git diff --check` passed after these splits.

- Task: Started the architecture cleanup for agent token efficiency around the largest hub files.
- Hub split: moved private `OrderService` row/result shapes to `apps/hub-electron/src/domain/order-service/types.ts`, CSV import parsing/coercion to `csv-import.ts`, pure date/note helpers to `helpers.ts`, tax parsing to `tax.ts`, discount/allocation math to `billing-calculations.ts`, Manager/Master PIN approval mechanics to `approvals.ts`, printer profile/layout helpers to `printer-settings.ts`, alcohol usage math to `alcohol-usage.ts`, daily report aggregation to `report-summary.ts`, and range report aggregation to `report-range.ts`.
- Mobile split: moved the QR scanner modal to `apps/mobile/src/components/pairing-scanner-modal.tsx` and the large POS chime data URI to `apps/mobile/src/lib/pos-chime.ts` so `App.tsx` is lighter to load.
- API split: moved pairing URL/LAN address selection to `apps/hub-electron/src/api/pairing-url.ts`, realtime role filtering to `realtime-visibility.ts`, shared route inputs/auth context to `route-context.ts`, catalog/setup CRUD routes to `catalog-routes.ts`, settings/printer/PIN/hub-connection routes to `settings-routes.ts`, billing routes to `billing-routes.ts`, print job routes to `print-routes.ts`, report routes to `report-routes.ts`, and backup/update/full-reset routes to `maintenance-routes.ts`, while preserving public exports from `api/server.ts`.
- Renderer split: moved report history/detail panels to `apps/hub-electron/src/renderer/components/reports/report-detail-panels.tsx`, leaving `reports-view.tsx` focused on report tabs/range orchestration. Moved hub renderer DTOs to `apps/hub-electron/src/renderer/hub-api-types.ts` while re-exporting them from `hub-api.ts`.
- Report detail split: moved bill history table, reprint, owner edit modal, payment correction, item correction, print chooser, and query invalidation to `apps/hub-electron/src/renderer/components/reports/report-history-panel.tsx` and `report-history-table.tsx`, leaving `report-detail-panels.tsx` focused on payments/categories/items summary panels.
- Setup split: moved hub connection setup to `apps/hub-electron/src/renderer/components/setup/hub-connection-card.tsx` and printer/output/layout setup to `apps/hub-electron/src/renderer/components/setup/printer-setup-card.tsx`, leaving `setup-view.tsx` as setup page orchestration.
- Advanced split: moved app update, GitHub release install, rollback baseline, manual package install, and rollback flow to `apps/hub-electron/src/renderer/components/advanced/app-update-panel.tsx` while keeping the old `advanced-view.tsx` export for tests/import compatibility.
- Order workspace split: moved new order draft search/open-item/KOT submit/draft-line editing to `apps/hub-electron/src/renderer/components/orders/new-order-panel.tsx` and moved shared table edit item types to `order-workspace-types.ts`, leaving `table-workspace.tsx` focused on selected-table orchestration.
- Billing split: moved printed-bill revision search, item editing, manager approval, idempotency, and save mutation to `apps/hub-electron/src/renderer/components/orders/bill-revision-editor.tsx`, leaving `billing-panel.tsx` focused on bill adjustments, payment, reprint, and NC actions.
- Alcohol split: moved alcohol item creation, recipe entry, and CSV import workflow to `apps/hub-electron/src/renderer/components/alcohol/alcohol-item-create-panel.tsx`, leaving `alcohol-items-panel.tsx` focused on catalog search, edit, and delete maintenance.
- Update split: moved GitHub release discovery, asset download, version comparison, release parsing, and update-package validation adapter to `apps/hub-electron/src/update/github-update-source.ts`, leaving `app-update-service.ts` focused on local baseline, install, rollback, state, and recovery-script orchestration.
- Mobile split: moved style tokens and focused style groups out of `apps/mobile/src/styles/app-styles.ts` into `app-style-tokens.ts`, `app-shell-styles.ts`, `service-workflow-styles.ts`, `menu-ticket-styles.ts`, and `billing-overlay-styles.ts`. Moved App side-effect helpers to `use-operation-keys.ts`, `use-mobile-chime.ts`, and `use-bill-printer-chooser.ts`. Moved table/item transfer workflow and target picker from `ticket-screen.tsx` to `apps/mobile/src/components/ticket-transfer-section.tsx`. Moved billing history screen/edit flow from `billing-panel.tsx` to `apps/mobile/src/components/billing-history-panel.tsx` with the old module re-export preserved.
- Stability fix: KOT list/sequence queries now use SQLite `rowid` as a deterministic tie-breaker when multiple tickets share the same millisecond timestamp; related tests select latest rows with the same tie-breaker.
- Impact: `apps/hub-electron/src/domain/order-service.ts` dropped from 5483 to 4444 lines, `apps/hub-electron/src/api/server.ts` dropped from 1044 to 442 lines, `apps/hub-electron/src/renderer/components/reports/reports-view.tsx` dropped from 997 to 375 lines, `apps/hub-electron/src/renderer/components/reports/report-detail-panels.tsx` dropped from 627 to 149 lines, `apps/hub-electron/src/renderer/hub-api.ts` dropped from 871 to 352 lines, `apps/hub-electron/src/renderer/components/setup/setup-view.tsx` dropped from 694 to 192 lines, `apps/hub-electron/src/renderer/components/advanced/advanced-view.tsx` dropped from 675 to 376 lines, `apps/hub-electron/src/renderer/components/orders/table-workspace.tsx` dropped from 654 to 417 lines, `apps/hub-electron/src/renderer/components/orders/billing-panel.tsx` dropped from 594 to 385 lines, `apps/hub-electron/src/renderer/components/alcohol/alcohol-items-panel.tsx` dropped from 576 to 186 lines, `apps/hub-electron/src/update/app-update-service.ts` dropped from 619 to 374 lines, `apps/mobile/src/components/ticket-screen.tsx` dropped from 630 to 476 lines, `apps/mobile/src/components/billing-panel.tsx` dropped from 501 to 244 lines, `apps/mobile/src/styles/app-styles.ts` dropped from 852 to 15 lines, and `apps/mobile/src/App.tsx` dropped from 1004 to 925 lines while shedding the large chime data URI and focused side-effect hooks.
- Reusable pieces: check `.agent/reuse-map.md` before loading full `OrderService`, `server.ts`, `reports-view.tsx`, `report-detail-panels.tsx`, `hub-api.ts`, `setup-view.tsx`, `advanced-view.tsx`, `table-workspace.tsx`, hub `billing-panel.tsx`, hub `alcohol-items-panel.tsx`, app update service, mobile `App.tsx`, mobile `ticket-screen.tsx`, mobile `billing-panel.tsx`, or mobile styles; helper modules now cover common import, tax, billing, approvals, printer settings, alcohol usage, daily reports, range reports, pairing, realtime visibility, route context, catalog routes, billing routes, print routes, report routes, settings routes, maintenance routes, report history panel/table, report detail panels, app update panel, GitHub update source, renderer API DTOs, setup connection, setup printing, new order panel, order workspace types, hub bill revision, alcohol item create/import, scanner modal, mobile chime, operation keys, printer chooser, mobile ticket transfer, mobile billing history, and mobile style groups.
- Verification: hub typecheck/lint passed after the renderer splits; `pnpm --filter @gaurav-pos/hub-electron test -- src/tests/order-service.test.ts src/tests/api-server.test.ts` passed on rerun with 28 test files and 264 tests; mobile typecheck/lint/tests passed with 9 files and 37 tests. The first sandboxed run failed only on localhost WebSocket binding, and one immediate rerun exposed the timestamp-order flake fixed above.

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

## 2026-05-17

- Task: Reworked the frontend styling foundation to reduce custom CSS and move toward shadcn/Tailwind defaults.
- Hub renderer: replaced the oversized hand-written renderer stylesheet with a compact Tailwind utility-based stylesheet that keeps existing semantic class hooks while using theme tokens, restrained controls, tighter panels, and fewer decorative rules.
- Hub cleanup: removed the obsolete `src/public` static fallback and `scripts/copy-public.mjs`; Fastify now serves the Vite-built `dist/public` renderer only, eliminating the duplicate legacy HTML/JS/CSS shell.
- Hub modularity: moved alcohol edit variant/inventory helpers into `components/alcohol/alcohol-edit-model.ts`, leaving `alcohol-edit-form.tsx` focused on form state/rendering.
- Cloud admin: added Tailwind/PostCSS configuration and rewrote global styling into Tailwind base/components/utilities with shadcn-compatible CSS variables and simpler app/portal component classes.
- Cloud admin polish: added `src/app/icon.svg` so the production shell no longer 404s the favicon in browser checks.
- Cloud admin modularity: split the owner portal route into `components/cloud-dashboard.tsx`, `components/cloud-admin-sections.tsx`, `components/cloud-admin-widgets.tsx`, and small `lib/cloud-*` helpers/types so `src/app/page.tsx` is just the auth shell.
- Mobile: added NativeWind/Tailwind plumbing for Expo, imported the global NativeWind stylesheet, split the large React Native palette/style block out of `App.tsx` into `src/styles/app-styles.ts`, moved reusable mobile formatting/pairing helpers into `src/lib/mobile-format.ts` with coverage in `src/tests/mobile-format.test.ts`, and split mobile UI into `components/app-shell.tsx`, `table-screen.tsx`, `menu-screen.tsx`, `ticket-screen.tsx`, `billing-panel.tsx`, and related screen files.
- Hub modularity follow-up: split setup catalog/business-day cards, sent-order transfer/editor panel, and responsive CSS into focused files; `setup-view.tsx`, `table-workspace.tsx`, and hub `styles.css` are now under 500 lines.
- Mobile follow-up: moved device pairing, manual connection, and QR scanner state into `src/hooks/use-device-pairing.ts`, keeping `App.tsx` below the prior danger zone while preserving the camera pairing feature.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/cloud-admin build`, `git diff --check`, and a Playwright smoke check of `http://localhost:3000` passed. Hub production build reports only the existing >500 kB chunk warning. The Playwright console still shows expected WorkOS cross-origin noise when auth prefetch touches the external sign-in endpoint.

## 2026-05-17

- Task: Tightened hub and phone primitive UI after rendered review showed inconsistent inputs, buttons, collapsible headings, and nav hover states.
- Hub UI: added shadcn-like base styling for raw `button`, `input`, `select`, `textarea`, `details`, and `summary` elements; aligned local Button/Input/Select/Textarea/Checkbox primitives to the same 40px control baseline; fixed setup card title/summary spacing; switched hub nav back to stable `.nav-button` classes so active hover keeps contrast.
- Mobile UI: replaced the beige-heavy palette with a neutral shadcn-style palette, standardized core button/input/card radii and heights, reduced oversized CTA treatment, improved collapsible control consistency, and added Expo web dependencies so the phone UI can be opened in a browser for visual review.
- Mobile tooling: fixed NativeWind Metro ESM import and aligned `react-native-reanimated` / `react-native-safe-area-context` to Expo SDK 55 expected versions.
- Verification: Playwright screenshots captured hub first-run, hub setup, hub take-orders, and mobile onboarding screens under `.agent/screenshots`; `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/mobile exec expo export --platform web --output-dir dist-web-check`, `pnpm lint`, and `git diff --check` passed. Hub build still reports the existing >500 kB chunk warning.

## 2026-05-17

- Task: Continued the full hub/phone UI audit with populated runtime states instead of only empty screens.
- Hub UI: removed the duplicate inline sale-group row implementation, kept a single `SaleGroupRow`, and added focused component CSS for sale/tax rows, ticket headers, segmented controls, guest/send rows, compact menu cards, and manager PIN layout.
- Hub Orders: selecting a table now opens the menu by default, chooses the first sale group that actually has active dishes, and renders menu category icons/buttons inside stable shadcn-style rows instead of collapsed or unstyled fragments.
- Hub remaining pages: tightened Alcohol add-item grouping, Kitchen ticket cards/actions, and Reports payment/category rows after screenshots of Alcohol, Kitchen, and Reports exposed lingering default-looking layout.
- Design tokens: moved hub, shared, cloud, and mobile palettes to a neutral shadcn-like palette and removed remaining ad hoc placeholder/inline color usage outside token declarations and category tone helpers.
- Phone verification: paired a temporary waiter device against a seeded local hub using manager PIN 1234 and checked phone Tables, Menu, and Check screens in Expo web with the real hub data path.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/mobile exec expo export --platform web --output-dir dist-web-check`, `pnpm lint`, and `git diff --check` passed. Local screenshots captured hub Setup, Orders, Advanced, phone onboarding, and paired phone Tables/Menu/Check under `.agent/screenshots`. Hub build still reports only the existing >500 kB chunk warning.

## 2026-05-17

- Task: Addressed the follow-up Take Orders and QR pairing UI complaints from rendered review.
- Hub Orders: changed Take Orders to a tables-first screen. Selecting a table now opens a dialog-style order workspace; the menu starts closed and is available through `Open menu`, keeping the table actions primary.
- Hub visual polish: strengthened table state color coding with stable left accents/count pills, made order menu filters single-line inside the modal, and fixed QR role cards so inactive roles are dark text on white while the active role is white text on dark.
- Build output: replaced the failing object-form chunk config with Vite/Rolldown-compatible function `manualChunks`, splitting React, TanStack Query, and UI libraries. The previous `>500 kB` hub bundle warning is gone.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm lint`, and `git diff --check` passed. Seeded local hub screenshots captured tables-first Orders, selected-table modal with menu closed/open, and QR role card contrast under `.agent/screenshots`.

## 2026-05-17

- Task: Continued the populated UI walkthrough for the remaining hub/mobile complaints.
- Hub CSS order: moved component and responsive stylesheet loading after the main hub stylesheet so responsive overrides win predictably.
- Hub Orders: fixed the class mismatch between shared table states and CSS (`bill-printed` / `needs-attention`), so billed tables now render with the intended blue state instead of falling back to neutral gray.
- Hub Reports/Kitchen: flattened the current-day report detail area into ledger-style sections instead of nested card stacks, and changed kitchen ticket action buttons to status-colored affordances for preparing/ready/served instead of three identical black buttons.
- Mobile: narrow phone table cards now use full-width stacked tiles instead of calculating two columns that rendered as one narrow column with dead space. Verified the paired mobile web preview against a seeded local hub with running, billed, and free table states.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, mobile web export, `pnpm lint`, and `git diff --check` passed. Screenshots captured hub table colors, flattened reports, kitchen status buttons, and mobile full-width table cards under `.agent/screenshots`.

## 2026-05-17

- Task: Finished the seeded hub click-through pass for order modification, reports, kitchen, pairing, and support controls.
- Hub click-through: seeded a fresh local hub with running, billed, paid, and free table states, then drove Take Orders, sent-item editing, transfer controls, billed-table revision with manager PIN approval, reports, kitchen status actions, setup pairing QR creation, and advanced support tools through Chrome CDP.
- Hub polish: added a hub favicon link and `/favicon.ico` fallback, framed the topbar refresh icon so it reads as a button, added dialog descriptions for Radix accessibility warnings, and supplied autocomplete/username hints for manager PIN and hub sync secret forms.
- Verification: corrected CDP audit passed all interaction steps; a fresh built-bundle load had no console/network events, the favicon resolved, and the topbar refresh button computed as white with a visible border. `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, mobile web export, `pnpm lint`, and `git diff --check` passed. Hub build remains split under the previous 500 kB warning threshold.

## 2026-05-17

- Task: Continued the hub/mobile visual audit from current rendered state.
- Hub fixes: fixed the reusable segmented control so active tabs render with the expected dark selected state, cleaned sent-order line item spacing so item names/prices no longer run together, rebuilt the transfer panel toggle as a visible full-width control, added transfer row/quantity control layout, and shortened report payment labels to avoid cramped wrapping.
- Hub evidence: captured current rendered screenshots for Setup, Take Orders table map, selected-table modal states, Alcohol, Kitchen, Reports, and Advanced under `.agent/screenshots/current-hub-*` and `.agent/screenshots/postfix-hub-*`; the browser audit reported no console/network events.
- Mobile evidence: paired a waiter token against the seeded hub and captured mobile Tables, selected-table Menu, and Check screens under `.agent/screenshots/current-mobile-*` using the exported web bundle.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, mobile web export, `pnpm lint`, and `git diff --check` passed. Hub chunks remain below the old warning threshold.

## 2026-05-17

- Task: Closed the remaining narrow-phone menu overflow found during the final seeded mobile pass.
- Mobile fix: multi-variant menu items now render as stacked cards with wrapped variant buttons, so alcohol sizes such as 30 ml / 180 ml / 750 ml stay inside the card instead of clipping horizontally on a 390px viewport.
- Evidence: captured `.agent/screenshots/deep-mobile-menu-after-patch.png` and `.agent/screenshots/deep-mobile-menu-after-patch.json`; browser bounds showed `scrollWidth` equal to the 390px viewport and all variant controls inside the card.
- Verification: `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, `pnpm --filter @gaurav-pos/mobile exec expo export --platform web --output-dir dist-web-check`, `pnpm lint`, and `git diff --check` passed.

## 2026-05-17

- Task: Re-audited the current built hub instead of treating completion as already proven.
- Hub fix: table map rows now keep a stable 120px tile height and table bodies have an explicit hover affordance, so second-row free tables no longer render shorter than first-row tables.
- Hub fix: alcohol catalog rows now stack the liquor name and bottle-size metadata, fixing the rendered `Royal Stag750 ml / 180 ml` text collision.
- Evidence: captured current built-hub screenshots under `.agent/screenshots/audit3-*`, `.agent/screenshots/audit4-*`, `.agent/screenshots/audit5-*`, and `.agent/screenshots/audit6-*`. DOM audits show no page-level horizontal scroll, role-card text has visible contrast, menu filters stay in one row, reports have no nested card count, and the final built hub emitted no console/network events.
- Mobile evidence: rebuilt the Expo web export and captured `.agent/screenshots/audit7-mobile-tables.png`, `.agent/screenshots/audit7-mobile-menu.png`, and `.agent/screenshots/audit7-mobile-check.png` at 390px against the seeded hub; the mobile DOM audit showed no horizontal scroll or overflow events.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile test`, `pnpm --filter @gaurav-pos/mobile exec expo export --platform web --output-dir dist-web-check`, `pnpm test`, `pnpm lint`, and `git diff --check` passed after updating the stale orders-view layout test.

## 2026-05-17

- Task: Fixed the order-modal menu card layout after rendered review showed cramped alcohol cards with overlapping category text.
- Hub fix: compact menu cards now force item name/category into a vertical text stack, the order-modal menu grid is single-column, and variant buttons use equal-width responsive columns instead of squeezing into tiny two-column cards.
- Evidence: captured `.agent/screenshots/menu-card-fix-hub-order-menu.png` and `.agent/screenshots/menu-card-fix-hub-order-menu-alcohol.png`; the alcohol DOM audit showed the three variant buttons in one row and no overflow inside the menu panel.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, and `git diff --check` passed.

## 2026-05-17

- Task: Fixed the sent-items editor controls after rendered review showed quantity buttons colliding with the `2 x` label and an unstructured edit/search block.
- Hub fix: quantity clusters now use fixed `[-] [qty] [+]` columns with stable button sizing, and the sent-items editor header now renders as a proper panel with an Edited Total label, Saved pill, and Add Item search field.
- Evidence: captured `.agent/screenshots/sent-editor-qty-fix.png`; DOM bounds show each quantity cluster has separate 38px buttons and a 48px centered quantity label with no overflow.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, and `git diff --check` passed.
## 2026-05-17

- Task: Added inline new-order menu search and cleaned the remaining rough hub operational surfaces raised in rendered screenshots.
- Hub fix: New order now has an in-panel Add Dish search with compact menu result rows and variant buttons, so normal menu items can be added without opening the side menu. Sent-item add search uses the same row structure.
- Hub fix: Alcohol CSV import, catalog edit rows, stock adjustment rows, Kitchen KOT cards, Reports bill history, item summaries, and alcohol movement rows now use constrained operational layouts instead of stretched auto-fit strips.
- Evidence: captured .agent/screenshots/new-order-menu-search-results-fix.png, .agent/screenshots/new-order-menu-search-after-add.png, .agent/screenshots/reports-layout-fix.png, .agent/screenshots/alcohol-items-edit-import-fix.png, .agent/screenshots/alcohol-storage-fix.png, and .agent/screenshots/kitchen-layout-fix.png; browser overflow audits passed on the checked screens.
- Verification: previous entry was truncated in an older devlog write; see surrounding screenshots/evidence for that UI pass.
## 2026-05-17

- Task: Reworked Reports and remaining spacing defects after rendered review showed fake table rows, clipped bill history, collapsed CSV spacing, and cramped KOT cards.
- Hub fix: Reports now uses semantic tables for payments, sale/tax categories, order history, item summary, closed day reports, and alcohol stock movements. Metrics have semantic color bands and bill status is shown as paid/pending chips.
- Hub fix: Closed report detail spans the full table width, new-order search result actions stay inline on desktop, collapsed CSV import summary is compact, and Kitchen KOT cards have proper vertical spacing.
- Evidence: captured .agent/screenshots/reports-semantic-tables-fix.png, .agent/screenshots/new-order-search-row-inline-fix.png, .agent/screenshots/alcohol-csv-collapsed-summary-fix.png, and .agent/screenshots/kitchen-spacing-fix.png; browser audits showed no page overflow and only intentional table wrappers can scroll if data is wider than the viewport.
- Verification: previous entry was truncated in an older devlog write; see surrounding screenshots/evidence for that reports pass.
## 2026-05-17

- Task: Tightened remaining hub operational layout issues from rendered feedback.
- Hub fix: Order menu cards now behave as compact list rows, with single-price actions inline and liquor variants in a controlled compact row.
- Hub fix: Guest/KOT controls now give the guest input a compact width and make KOT actions the primary area; transfer panel now has clearer mode, target, warning, and action styling.
- Hub fix: Reports tables reserve non-wrapping bill/status columns and the business-day metric grid has explicit responsive spacing.
- Hub fix: Alcohol Catalog now renders as a semantic table with compact price chips and a full-width edit detail row; setup/details dropdown summaries now have stronger section affordance; line items now place amount before quantity controls.
- Evidence: captured .agent/screenshots/order-menu-list-row-fix.png, .agent/screenshots/transfer-panel-guest-row-fix.png, .agent/screenshots/details-header-alcohol-catalog-table-fix.png, and related line-row screenshots. This older entry was truncated before this architecture pass.

## 2026-05-17

- Task: Fixed visually weak collapsed disclosure/dropdown section headers after rendered review showed CSV import sections disappearing into white space.
- Hub fix: setup-subdetails and csv-import-details now share a proper section-control pattern: no inherited card padding, stronger border, left accent rail, accent wash, metadata pill, stable chevron action, and cleaner open-state body spacing.
- Evidence: captured .agent/screenshots/disclosure-section-header-fix.png, .agent/screenshots/disclosure-section-open-fix.png, and .agent/screenshots/setup-disclosure-section-header-fix.png; DOM audits showed the alcohol CSV header renders as a 60px grid row with no page overflow.
- Verification: pnpm --filter @gaurav-pos/hub-electron build, pnpm --filter @gaurav-pos/hub-electron typecheck, and git diff --check passed.

## 2026-05-17

- Task: Improved setup sub-record menus after rendered review showed Kitchens/Counters edit rows using stretched forms and primary-looking row actions.
- Hub fix: Editable setup records now have compact title/status rows, secondary edit/disable actions, destructive delete styling, highlighted editing state, and a dedicated bordered edit panel with grouped fields plus separated save actions.
- Hub fix: Kitchen/counter metadata now reports printer/Kitchen-screen visibility instead of repeating only Active.
- Evidence: captured .agent/screenshots/setup-record-edit-row-fix.png and .agent/screenshots/setup-record-edit-row-visible-fix.png; DOM audit showed no page overflow and secondary row buttons rendering at compact 34px height.
- Verification: pnpm --filter @gaurav-pos/hub-electron build, pnpm --filter @gaurav-pos/hub-electron typecheck, and git diff --check passed.

## 2026-05-17

- Task: Fixed line item price placement and ran a phone-width visual pass after rendered feedback showed prices dropping into empty space.
- Hub fix: LineItems now render amount before quantity controls in DOM order, and CSS uses a stable item / amount / quantity grid instead of forcing amount backward into column 2. This removes the second-row desktop price bug.
- Hub fix: Pair Phones and Devices now has a structured pairing flow with constrained form width, role cards, QR/code panel, and a separate manual payload panel so QR details do not collide.
- Evidence: captured .agent/screenshots/line-row-price-placement-desktop-fix.png, .agent/screenshots/phone-pass-line-row-fix.png, and .agent/screenshots/phone-pass-pairing-card-fix.png. DOM audits showed no horizontal overflow; desktop line rows are 68px high, phone rows keep amount left and quantity controls right.
- Verification: pnpm --filter @gaurav-pos/hub-electron build, pnpm --filter @gaurav-pos/hub-electron typecheck, and git diff --check passed.

## 2026-05-17

- Task: Fixed desktop QR pairing card clipping after rendered feedback showed the code and expiry text cut off beside the QR.
- Hub fix: Pairing QR panel is now vertical and constrained: QR on top, code/expiry underneath, payload in its own panel. Code/expiry wrap within the QR panel instead of overflowing sideways.
- Evidence: captured .agent/screenshots/pairing-card-desktop-no-clip-fix.png and .agent/screenshots/pairing-card-phone-no-clip-fix.png. DOM audit showed no horizontal overflow and codeInside=true on desktop and phone-width checks.
- Verification: pnpm --filter @gaurav-pos/hub-electron build, pnpm --filter @gaurav-pos/hub-electron typecheck, and git diff --check passed.

## 2026-05-17 mobile menu/history pass
- Added captain-only History tab in the Expo app and moved billing history out of Captain Billing.
- Restyled mobile menu rows with stronger card separation, larger category icons, separated variant/action areas, and more spacing.
- Verified: pnpm --filter @gaurav-pos/mobile typecheck; pnpm --filter @gaurav-pos/mobile test; Expo web smoke render with mock hub in Chrome.

## 2026-05-20 mobile App hook split
- Task: Continued architecture pass on the Expo mobile app after prior style/chime/pairing extractions.
- Mobile split: `App.tsx` now delegates history bill print/edit/day selection to `useBillingHistoryActions`, keeping owner history mutations, print target selection, idempotency, and selected-day reload in one module.
- Mobile split: `App.tsx` now delegates selected-table draft state, draft persistence, item quantity/note edits, table selection, and draft clearing to `useOrderDraft`.
- Mobile split: `App.tsx` now delegates KDS unit selection and ticket status updates to `useKitchenActions`.
- Result: `apps/mobile/src/App.tsx` is down to 822 lines; the new hooks are 95, 102, and 63 lines with narrower interfaces and better locality for draft/history/kitchen behaviour.

## 2026-05-20 mobile HubClient split
- Task: Reduced mobile LAN client file size and separated contracts from the REST adapter.
- Mobile split: `apps/mobile/src/lib/hub-client.ts` now keeps the `HubClient` implementation and re-exports its public contract for compatibility.
- Mobile split: `apps/mobile/src/lib/hub-client-types.ts` owns mobile hub response/request contracts; `apps/mobile/src/lib/hub-client-helpers.ts` owns realtime URL, HTTP error, idempotency, and pairing alert helpers.
- Result: `hub-client.ts` is down from 528 to 312 lines; helper/contract interfaces now have better locality for agents looking up endpoint shapes or pairing/realtime behaviour.

## 2026-05-20 mobile App derived-state split
- Task: Continued shrinking the mobile root module below the 800-line refactor signal.
- Mobile split: `apps/mobile/src/lib/mobile-app-view-model.ts` owns active table filtering, selected table lookup, draft/sent totals, menu filters/search, and active KDS unit derivation.
- Mobile split: `apps/mobile/src/lib/order-command-builders.ts` owns KOT review summaries and bill revision item payload construction.
- Tests: Added focused tests for the view-model derivation and order command builders.
- Result: `apps/mobile/src/App.tsx` is down to 789 lines with more behaviour behind small pure module interfaces.

## 2026-05-20 mobile table service action split
- Task: Moved service-hour table command workflows out of the mobile root module.
- Mobile split: `apps/mobile/src/hooks/use-table-service-actions.ts` owns KOT submit confirmation, table/item transfer commands, bill generate/reprint/NC/settle/revise commands, idempotency scopes, printer choice handoff, and post-command refresh/reload messages.
- Result: `apps/mobile/src/App.tsx` is down from 789 to 560 lines; the new hook is 329 lines and gives table service commands better Locality than the root render module.
- Verification: `pnpm --filter @gaurav-pos/mobile typecheck`, `pnpm --filter @gaurav-pos/mobile lint`, `pnpm --filter @gaurav-pos/mobile test` (11 files / 40 tests), and `git diff --check` passed.

## 2026-05-20 hub read-model split
- Task: Continued reducing `OrderService` size without touching write-path transaction rules.
- Hub split: `apps/hub-electron/src/domain/order-service/read-models.ts` now owns KDS ticket listing, full order read model building, and print-job list read models.
- Test split: `insertDailySnapshot` moved from the large order-service test into `apps/hub-electron/src/tests/helpers.ts` for report fixture reuse.
- Result: `apps/hub-electron/src/domain/order-service.ts` is down to 4364 lines; `order-service.test.ts` is down to 3103 lines. This is still large, but read/query shape is now easier to find without opening the main mutation-heavy module.

## 2026-05-20 hub row-query split
- Task: Removed repeated SQL/Drizzle row selectors from `OrderService`.
- Hub split: `apps/hub-electron/src/domain/order-service/order-item-queries.ts` owns the canonical order-item row selection plus list/by-menu-key/by-open-name/by-id lookups.
- Hub split: `apps/hub-electron/src/domain/order-service/bill-queries.ts` owns the canonical bill row selection plus by-id and latest-for-order lookups.
- Result: `apps/hub-electron/src/domain/order-service.ts` is down to 4214 lines, with repeated row-shape knowledge concentrated behind query module interfaces.

## 2026-05-20 hub settings model split
- Task: Moved pure hub setting and print-layout model logic out of `OrderService`.
- Hub split: `apps/hub-electron/src/domain/order-service/settings-models.ts` now owns hub connection setting read/write shape, ticket-template projection/write values, print-layout read merge, and print-layout write merge.
- Result: `apps/hub-electron/src/domain/order-service.ts` is down to 4164 lines; event emission and validation still stay in `OrderService`, while setting data shape lives behind a smaller module interface.

## 2026-05-20 hub report CSS split
- Task: Continued shrinking oversized hub renderer stylesheets after printer/update style extraction.
- Hub split: `apps/hub-electron/src/renderer/styles/reports.css` now owns report tabs/range controls, report metrics, closed-report rows, report tables, bill-history rows, report-history edit controls, stock movement rows, and their report-specific responsive rules.
- Result: `apps/hub-electron/src/renderer/styles/components.css` is down to 923 lines and root `apps/hub-electron/src/renderer/styles.css` is down to 995 lines; generic summary/compact-row styling stays in components while report/table/history styling has a focused stylesheet imported from `App.tsx`.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/reports-view.test.tsx`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 36 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub inventory/report service split
- Task: Continued reducing `OrderService` facade size and moving hidden domain SQL to searchable modules.
- Hub split: `apps/hub-electron/src/domain/order-service/alcohol-stock-consumption.ts` owns paid-bill alcohol deduction, pending alcohol usage, and history-edit stock delta application.
- Hub split: `apps/hub-electron/src/domain/order-service/bill-cleanup.ts` owns empty pending bill cleanup used during bootstrap/report freshness; `report-snapshots.ts` owns daily report snapshot list/get reads.
- Result: `apps/hub-electron/src/domain/order-service.ts` is down to 1449 lines; alcohol inventory settlement/history behaviour and report snapshot reads now have focused modules.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/order-service-alcohol.test.ts src/tests/order-service-billing.test.ts src/tests/order-service-history.test.ts src/tests/reports-view.test.tsx`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 36 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub billing test split
- Task: Reduced oversized billing test ownership and made setup/reporting coverage easier to find.
- Test split: `order-service-billing.test.ts` now keeps bill print, payment, settlement, adjustment, receipt/reprint, and bill-printer routing coverage.
- Test split: `order-service-reporting.test.ts` owns business-day summaries, finalized reports, range aggregation, and bootstrap popularity coverage.
- Test split: `order-service-setup-catalog.test.ts` owns setup catalog CRUD/custom IDs/sort/delete semantics, bulk dish deletes, and KDS retry coverage.
- Result: `order-service-billing.test.ts` is down from 806 to 442 lines; new focused files are 202 and 170 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/order-service-billing.test.ts src/tests/order-service-reporting.test.ts src/tests/order-service-setup-catalog.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 38 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub KOT test split
- Task: Reduced oversized KOT test ownership and separated bill/order-state coverage that was hidden in the same file.
- Test split: `order-service-kot.test.ts` now keeps KOT creation/modification sequencing, KDS visibility, KOT-only print mode, and cancellation coverage.
- Test split: `order-service-order-state.test.ts` owns running table totals, sent-order save modes, item note merge/clear behaviour, and price snapshot rows.
- Test split: `order-service-bill-lifecycle.test.ts` owns no-kitchen billing, bill tax snapshots, bill numbering, GST print summary, empty pending bill cleanup, paid-bill removal guards, and cash settlement.
- Result: `order-service-kot.test.ts` is down from 709 to 232 lines; new focused files are 251 and 236 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/order-service-kot.test.ts src/tests/order-service-bill-lifecycle.test.ts src/tests/order-service-order-state.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 40 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub alcohol test split
- Task: Reduced oversized alcohol test ownership and made stock, settlement, catalog, and revision behaviour searchable by file name.
- Test split: `order-service-alcohol.test.ts` now keeps manual stock adjustment approvals, movement listing, and disable-on-movement semantics.
- Test split: `order-service-alcohol-settlement.test.ts` owns paid/NC alcohol stock deduction, negative stock, cocktail recipe snapshots, and unpaid snapshot deletion guards.
- Test split: `order-service-alcohol-catalog.test.ts` owns stale recipe cleanup, alcohol variant validation, prepared-product stock rules, recipe-based disable/delete, and bulk alcohol removal.
- Test split: `order-service-alcohol-revision.test.ts` owns inactive variant bill revision and revised bill audit totals.
- Result: `order-service-alcohol.test.ts` is down from 705 to 108 lines; new focused files are 278, 236, and 96 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/order-service-alcohol.test.ts src/tests/order-service-alcohol-settlement.test.ts src/tests/order-service-alcohol-catalog.test.ts src/tests/order-service-alcohol-revision.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 43 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub order CSS split
- Task: Continued shrinking oversized hub renderer stylesheets and moved order/table plus alcohol/storage styles behind searchable modules.
- CSS split: `apps/hub-electron/src/renderer/styles/orders.css` now owns table map tiles, order workspace modal, order menu panel, bill payment/change-helper controls, line-item notes, and bill revision search styles.
- CSS split: `apps/hub-electron/src/renderer/styles/alcohol.css` now owns alcohol create/edit forms, catalog table rows, variant edit rows, storage cards, stock metrics, and stock adjustment controls.
- Result: root `apps/hub-electron/src/renderer/styles.css` is down from 995 to 603 lines; `components.css` is down to 786 lines; `orders.css` is 391 lines and `alcohol.css` is 131 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `typecheck`, `lint`, `test -- src/tests/orders-view.test.tsx src/tests/table-workspace.test.tsx src/tests/billing-panel.test.tsx`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 43 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub component CSS split
- Task: Continued reducing generic renderer component CSS and moved screen-specific KDS/order controls out of the catch-all file.
- CSS split: `apps/hub-electron/src/renderer/styles/kitchen.css` now owns KDS kitchen screen layout, KOT cards, KOT notes, KDS status buttons, and KOT grid styles.
- CSS split: order ticket header, guest/send controls, and order-specific responsive rules moved from `components.css` into `orders.css`.
- Result: `components.css` is down from 786 to 578 lines; `orders.css` is 497 lines and `kitchen.css` is 83 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `typecheck`, `lint`, `test -- src/tests/orders-view.test.tsx src/tests/table-workspace.test.tsx src/tests/kitchen-view.test.tsx src/tests/billing-panel.test.tsx`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 43 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub setup/pairing CSS split
- Task: Continued shrinking root hub renderer CSS and moved setup-specific rules into focused stylesheets.
- CSS split: `apps/hub-electron/src/renderer/styles/setup.css` owns setup cards, setup headings/status, setup search hint text, and unit edit field layout.
- CSS split: `apps/hub-electron/src/renderer/styles/pairing.css` now owns role cards and pairing QR/code/payload layout instead of leaving duplicate pairing rules in root CSS.
- Result: root `apps/hub-electron/src/renderer/styles.css` is down from 603 to 461 lines; setup/pairing styles are 59 and 87 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `typecheck`, `lint`, `test -- src/tests/hub-shell.test.tsx src/tests/bill-printer-chooser.test.tsx src/tests/order-service-setup-catalog.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub records CSS split
- Task: Removed reusable record/edit-list styling from the remaining catch-all component stylesheet.
- CSS split: `apps/hub-electron/src/renderer/styles/records.css` owns record list rows, status pills, move controls, record actions, inline edit forms, unit edit grids, and sale-group row/form layout used by setup, advanced, and backup lists.
- Result: `apps/hub-electron/src/renderer/styles/components.css` is down from 578 to 456 lines, and root `styles.css` remains under 500 at 456 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron build`, `typecheck`, `lint`, `test -- src/tests/hub-shell.test.tsx src/tests/order-service-setup-catalog.test.ts src/tests/app-update-panel.test.tsx`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 Convex admin helper split
- Task: Reduced the oversized Convex admin public module without changing `api.admin.*` function names.
- Convex split: `convex/admin/access.ts` owns membership/invite/command validators, identity lookup, restaurant member/admin/owner guards, email normalization, and random secret generation.
- Convex split: `convex/admin/reportModels.ts` owns daily report list/detail return validators and report DTO projection helpers.
- Result: `convex/admin.ts` is down from 761 to 562 lines, with auth/role locality and report shape locality improved for future admin work.
- Verification: `pnpm exec tsc -p convex/tsconfig.json --noEmit`, `pnpm exec convex codegen --typecheck disable`, `pnpm exec vitest run convex/*.test.ts`, and `git diff --check` passed.

## 2026-05-20 hub OrderService side-effect helper split
- Task: Continued shrinking `OrderService` by moving low-level SQL side effects out of the facade.
- Hub split: `event-log.ts` owns event_log/sync_outbox writes; `order-records.ts` owns order row create/select/require/free-table and move authorization; `sequences.ts` owns bill/KOT sequence reads/writes; `bill-revisions.ts` owns bill revision audit row writes.
- Result: `apps/hub-electron/src/domain/order-service.ts` is down from 1449 to 1338 lines; DB table imports for events, orders, restaurant_tables, bills, bill_revisions, and sync_outbox no longer live in the facade.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `test -- src/tests/order-service-billing.test.ts src/tests/order-service-kot.test.ts src/tests/order-service-order-state.test.ts src/tests/order-service-transfer.test.ts src/tests/order-service-alcohol-settlement.test.ts src/tests/order-service-alcohol-revision.test.ts`, `build`, `lint`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 43 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub history/report test split
- Task: Reduced oversized history test ownership and made report groups plus bill guard rules searchable by file name.
- Hub split: `apps/hub-electron/src/domain/order-service/settings-records.ts` owns hub setting read/write persistence used by settings and sequence helpers.
- Test split: `order-service-history.test.ts` now focuses on owner history edit flows, exact payment splits, pending-history rejection, NC history edits, and finalized snapshot refresh.
- Test split: `order-service-report-groups.test.ts` owns range bill-summary opt-in, NC finalization, sale group/open bar/BOT reporting, and discount/tip allocation.
- Test split: `order-service-bill-guards.test.ts` owns post-payment NC/revision guards and printed-bill price snapshot preservation.
- Test split: `order-service-alcohol-stock-lifecycle.test.ts` owns alcohol pending stock, paid settlement deduction, and history-edit stock delta/restore coverage.
- Result: `order-service-history.test.ts` is down from 621 to 268 lines; focused report, guard, and alcohol stock lifecycle files are 129, 99, and 138 lines. `OrderService` is 1336 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/order-service-history.test.ts src/tests/order-service-report-groups.test.ts src/tests/order-service-bill-guards.test.ts src/tests/order-service-alcohol-stock-lifecycle.test.ts src/tests/order-service-alcohol-settlement.test.ts src/tests/order-service-alcohol-revision.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub OrderService facade SQL cleanup
- Task: Removed remaining direct Drizzle/schema/raw lookup SQL from the `OrderService` facade.
- Hub split: `order-service/kot-status.ts` owns KOT/BOT status update transactions, ready-notification triggers, missing-KOT errors, and status-change events.
- Hub split: `menu-catalog.ts` now owns menu-item name lookup; `production-unit-queries.ts` now owns active production-unit id/name reference resolution.
- Result: `apps/hub-electron/src/domain/order-service.ts` is down to 1325 lines and no longer imports Drizzle, schema tables, `DomainError`, or raw SQL `.prepare(...)` calls.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `test -- src/tests/order-service-kot.test.ts src/tests/order-service-alcohol-catalog.test.ts src/tests/order-service-setup-catalog.test.ts src/tests/api-server-realtime-roles.test.ts`, `build`, `lint`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub API route helper split
- Task: Reduced hub API server registration by moving repeated auth, idempotency, and print-job processing behaviour behind focused helpers.
- API split: `apps/hub-electron/src/api/route-auth.ts` owns request token extraction, role preHandlers, and session lookup.
- API split: `apps/hub-electron/src/api/idempotency.ts` owns idempotency-key request hashing, in-progress conflict handling, replay, and failure marking.
- API split: `apps/hub-electron/src/api/print-job-processing.ts` owns created print-job processing totals used by order and billing routes.
- Result: `apps/hub-electron/src/api/server.ts` is down from 442 to 341 lines; `billing-routes.ts` now imports shared idempotency/print total types instead of redefining them.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `lint`, `build`, `test -- src/tests/api-server-auth-settings.test.ts src/tests/api-server-orders-billing.test.ts src/tests/api-server-realtime-roles.test.ts src/tests/api-server-print-catalog.test.ts src/tests/api-server-idempotency.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub pairing CSS split
- Task: Continued shrinking root hub renderer stylesheet and made setup/pairing styles searchable by file name.
- CSS split: `apps/hub-electron/src/renderer/styles/setup.css` owns setup board/card/status/search row styles.
- CSS split: `apps/hub-electron/src/renderer/styles/pairing.css` owns pairing copy/form, role cards, QR panel, manual code, and pairing payload panel styles.
- Result: root `apps/hub-electron/src/renderer/styles.css` is down from 603 to 461 lines; `setup.css` is 59 lines, `pairing.css` is 87 lines, and `components.css` remains 578 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/hub-shell.test.tsx src/tests/api-server-auth-settings.test.ts src/tests/api-server-print-catalog.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 shared schema module split
- Task: Reduced shared API contract blob and made command validation searchable by contract area.
- Shared split: `packages/shared/src/schemas.ts` is now a compatibility barrel; focused modules under `packages/shared/src/schemas/` own `common`, `order`, `billing`, `catalog`, `settings`, and `reports` contracts.
- Result: old 541-line `schemas.ts` is down to 6 lines; largest focused schema module is `catalog.ts` at 180 lines.
- Verification: `pnpm --filter @gaurav-pos/shared typecheck`, `test`, `build`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, `test -- src/tests/api-server-auth-settings.test.ts src/tests/api-server-orders-billing.test.ts src/tests/api-server-print-catalog.test.ts src/tests/order-service-billing.test.ts`, `pnpm --filter @gaurav-pos/mobile typecheck`, and `git diff --check` passed. The targeted hub test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub renderer API type split
- Task: Reduced the renderer REST DTO type bag while keeping existing `hub-api-types.ts` imports stable.
- Hub split: `apps/hub-electron/src/renderer/hub-api-types.ts` is now a compatibility type barrel; focused modules under `hub-api-types/` own `auth`, `update`, `catalog`, `printing`, `bootstrap`, `orders`, `alcohol`, and `reports` contracts.
- Result: old 553-line `hub-api-types.ts` is down to 8 lines; largest focused DTO module is `reports.ts` at 132 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `lint`, `build`, `test -- src/tests/hub-api.test.ts src/tests/hub-shell.test.tsx src/tests/table-workspace.test.tsx src/tests/reports-view.test.tsx src/tests/app-update-panel.test.tsx`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 hub setup catalog card split
- Task: Reduced a mixed setup UI module and made setup catalog cards searchable by restaurant concept.
- Renderer split: `apps/hub-electron/src/renderer/components/setup/setup-catalog-cards.tsx` is now a compatibility barrel; `floors-tables-card.tsx`, `kitchens-counters-card.tsx`, and `dishes-card.tsx` own their respective setup workflows.
- Result: old 488-line `setup-catalog-cards.tsx` is down to 3 lines; focused card modules are 202, 73, and 191 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `lint`, `build`, `test -- src/tests/hub-shell.test.tsx src/tests/order-service-setup-catalog.test.ts src/tests/api-server-print-catalog.test.ts`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 Convex admin membership split
- Task: Reduced the public Convex admin module while preserving stable `api.admin.*` Function names.
- Convex split: `convex/admin/membership.ts` owns restaurant list/create, pending invitation list/accept, staff list, invite/update/remove member, revoke invitation validators, and their handler Implementations.
- Result: `convex/admin.ts` is down from 562 to 343 lines; restaurant/staff membership Locality moved behind a focused Module while the public Convex Function Interface stays in `admin.ts`.
- Verification: `pnpm exec tsc -p convex/tsconfig.json --noEmit`, `pnpm exec convex codegen --typecheck disable`, `pnpm exec vitest run convex/*.test.ts`, and `git diff --check` passed.

## 2026-05-20 mobile refresh hook split
- Task: Reduced mobile root app orchestration and moved hub connection refresh behaviour behind a focused hook.
- Mobile split: `apps/mobile/src/hooks/use-mobile-hub-refresh.ts` owns stored hub/token hydration, polling, realtime refresh debounce, connection health transitions, role-specific bootstrap/report/KDS loads, ready notifications, and selected-table refresh.
- Result: `apps/mobile/src/App.tsx` is down from 560 to 428 lines; the new refresh hook is 239 lines and keeps service connection behaviour searchable without opening the root render module.
- Verification: `pnpm --filter @gaurav-pos/mobile typecheck`, `test`, `lint`, and `git diff --check` passed. Mobile tests: 11 files passed, 40 tests passed.

## 2026-05-20 hub print layout editor split
- Task: Reduced setup print layout editor by separating preview rendering and section font controls from save/scope orchestration.
- Renderer split: `apps/hub-electron/src/renderer/components/setup/print-layout-preview.tsx` owns sample receipt/KOT preview rendering and styled print-line display.
- Renderer split: `apps/hub-electron/src/renderer/components/setup/print-layout-style-controls.tsx` owns section size/alignment/bold controls and default section style.
- Result: `print-layout-editor.tsx` is down from 481 to 381 lines; preview and style controls are 107 and 79 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `test -- src/tests/hub-shell.test.tsx src/tests/bill-printer-chooser.test.tsx src/tests/api-server-print-catalog.test.ts`, `build`, `lint`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 mobile ticket state editor hook split
- Task: Reduced mobile table check screen by moving sent-item state editing and billed-table approval state out of render module.
- Mobile split: `apps/mobile/src/hooks/use-ticket-state-editor.ts` owns sent-item draft hydration, order-state signatures, state search/add, quantity/note edits, state totals, billed-state manager approval modal state, and save/save-print dispatch.
- Result: `apps/mobile/src/components/ticket-screen.tsx` is down from 476 to 400 lines; ticket state editing now has a focused hook Module for future table-state bugs.
- Verification: `pnpm --filter @gaurav-pos/mobile typecheck`, `lint`, `test`, and `git diff --check` passed. Mobile tests: 11 files passed, 40 tests passed.

## 2026-05-20 cloud admin section split
- Task: Reduced the cloud admin dashboard section bag and made owner-portal areas searchable by file name.
- Cloud split: `apps/cloud-admin/src/components/cloud-admin-sections.tsx` is now a compatibility barrel; `cloud-sections/reports-section.tsx`, `setup-section.tsx`, `staff-section.tsx`, `sync-section.tsx`, and `advanced-section.tsx` own their dashboard areas.
- Result: old 447-line `cloud-admin-sections.tsx` is down to 5 lines; focused section Modules are 185, 84, 99, 51, and 56 lines.
- Verification: `pnpm --filter @gaurav-pos/cloud-admin typecheck`, `lint`, `build`, and `git diff --check` passed.

## 2026-05-20 hub report CSS split
- Task: Reduced oversized report stylesheet by moving bill-history and alcohol stock movement styles behind feature-owned files.
- CSS split: `apps/hub-electron/src/renderer/styles/report-history.css` owns bill-history table sizing, history status chips, owner history edit modal, payment correction, item correction, and responsive rules for bill history.
- CSS split: `apps/hub-electron/src/renderer/styles/report-stock-movements.css` owns alcohol stock movement table sizing, row layout, balance pills, and responsive rules.
- Result: `apps/hub-electron/src/renderer/styles/reports.css` is down from 536 to 223 lines; report history and stock movement styles are 282 and 50 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, and `git diff --check` passed.

## 2026-05-20 hub order CSS split
- Task: Reduced oversized order stylesheet by separating table-map, billing, and bill-revision style ownership from order workspace shell styles.
- CSS split: `apps/hub-electron/src/renderer/styles/order-table-map.css` owns table tile state colours, duration pills, tile actions, map counts, and legend dots.
- CSS split: `apps/hub-electron/src/renderer/styles/order-billing.css` owns billing adjustments, payment grids, quick pay, change helper, reprint buttons, and mobile billing helper layout.
- CSS split: `apps/hub-electron/src/renderer/styles/order-revision.css` owns printed-bill revision search result list and keyboard-active state.
- Result: `apps/hub-electron/src/renderer/styles/orders.css` is down from 497 to 239 lines; focused table-map, billing, and revision files are 161, 69, and 27 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, and `git diff --check` passed.

## 2026-05-20 hub common component CSS split
- Task: Reduced generic renderer component stylesheet by moving feature-owned order-state, transfer, and print-layout styles out of the common bucket.
- CSS split: `apps/hub-electron/src/renderer/styles/order-state-editor.css` owns order-state/menu search editor shell, totals/status header, search rows, and editor actions.
- CSS split: `apps/hub-electron/src/renderer/styles/order-transfer.css` owns sent-item/full-table transfer toggle, mode switch, target field, warning, item quantity controls, and submit button styles.
- CSS split: `apps/hub-electron/src/renderer/styles/print-layout.css` owns setup print-layout editor scope card, toggles, section style rows, inline check, and responsive rules.
- Result: `apps/hub-electron/src/renderer/styles/components.css` is down from 456 to 209 lines; extracted order-state, transfer, and print-layout files are 72, 90, and 82 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, and `git diff --check` passed.

## 2026-05-20 hub root CSS primitive split
- Task: Removed the remaining 456-line root renderer stylesheet by moving shell, layout, row, and action primitives into focused files.
- CSS split: `apps/hub-electron/src/renderer/styles/hub-shell.css` owns hub shell grid, side rail, nav buttons, unlock card, main content frame, and topbar icon button styles.
- CSS split: `apps/hub-electron/src/renderer/styles/layout-primitives.css` owns shared panels, titles, layout grids, form/action rows, segmented rows, and toolbar/min-width primitives.
- CSS split: `apps/hub-electron/src/renderer/styles/row-primitives.css` owns shared surface rows/cards, line item grid, quantity cluster, saved settings card, and category badge primitives.
- CSS split: `apps/hub-electron/src/renderer/styles/action-primitives.css` owns shared buttons, split inputs, modal shell, CSV file button, print preview, and empty states.
- Result: `apps/hub-electron/src/renderer/styles.css` is down from 456 lines to a 1-line compatibility marker; focused primitive files are 40, 188, 139, and 86 lines.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `build`, `lint`, and `git diff --check` passed.

## 2026-05-20 hub report history edit modal split
- Task: Reduced report history orchestration by moving the owner history-edit modal view out of the report history panel.
- Renderer split: `apps/hub-electron/src/renderer/components/reports/report-history-edit-modal.tsx` owns the edit bill modal UI for subtotal/discount/tip summary, exact payment split, item correction, menu search, and Master PIN entry.
- Result: `report-history-panel.tsx` is down from 429 to 289 lines; the new modal view is 272 lines and keeps history edit rendering searchable without opening mutation orchestration.
- Verification: `pnpm --filter @gaurav-pos/hub-electron typecheck`, `test -- src/tests/reports-view.test.tsx src/tests/api-server-orders-billing.test.ts src/tests/order-service-history.test.ts`, `build`, `lint`, and `git diff --check` passed. The targeted test command currently runs the full hub suite: 46 files passed, 3 skipped, 264 tests passed.

## 2026-05-20 mobile SafeAreaView deprecation cleanup
- Task: Replaced deprecated React Native core `SafeAreaView` usage with `react-native-safe-area-context`.
- Mobile dependency: installed Expo SDK 55-compatible `react-native-safe-area-context@~5.6.2`.
- Mobile update: `apps/mobile/src/App.tsx` imports `SafeAreaProvider`/`SafeAreaView` from `react-native-safe-area-context` and wraps mobile root with the provider.
- Mobile update: `apps/mobile/src/components/pairing-scanner-modal.tsx` imports `SafeAreaView` from `react-native-safe-area-context`.
- Verification: `pnpm --filter @gaurav-pos/mobile typecheck`, `lint`, `test`, and `git diff --check` passed. Mobile tests: 11 files passed, 40 tests passed.

## 2026-05-20 mobile 0.1.3 Android release prep
- Task: Prepared the next Android APK build after the SafeAreaView cleanup.
- Mobile version: bumped `apps/mobile/package.json` and `apps/mobile/app.json` to `0.1.3`; added Android `versionCode: 3`.
- Expo cleanup: ignored local `.expo` state, removed tracked `.expo` device files, switched the cleartext plugin to `expo/config-plugins`, added `expo-asset`, and aligned Expo to `~55.0.25`.
- Verification: `pnpm install --frozen-lockfile`, `pnpm --filter @gaurav-pos/hub-electron test`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/mobile typecheck`, `lint`, `test`, `pnpm --filter @gaurav-pos/mobile exec expo install --check`, and `pnpm --filter @gaurav-pos/mobile exec npx -y expo-doctor` passed.
- Build note: local EAS Android build reached Gradle but failed because this Mac has no Java runtime or Android SDK installed. Hub Windows release packaging was not attempted on macOS arm64 because `docs/release-build-workflow.md` requires Windows x64 for trusted Hub artifacts.

## 2026-05-24 hub local storage cleanup hardening
- Task: Fixed the local storage review findings that could keep growing after raw cloud event sync was deprecated.
- Print failure path: `apps/hub-electron/src/printing/print-job-service.ts` now keeps the local `print_job.failed` audit event but no longer inserts deprecated `sync_outbox` rows.
- Daily maintenance: `apps/hub-electron/src/db/local-maintenance.ts` runs on startup and hourly wake, once per calendar day, clearing deprecated cloud sync tables and pruning short-lived local scratch rows: 30-day `event_log`, 30-day printed/failed print jobs, 7/30-day ready notifications, 14/1-day idempotency cache, and 7-day pairing codes.
- Backup retention: `apps/hub-electron/src/db/backup-service.ts` prunes only automatic `pre-update-*`/`pre-restore-*` safety backups to 30 days and 5 per prefix; manual backups remain untouched.
- Verification: `pnpm --filter @gaurav-pos/hub-electron exec vitest run src/tests/local-maintenance.test.ts src/tests/print-job-service.test.ts src/tests/backup-service.test.ts src/tests/runtime.test.ts`, `pnpm --filter @gaurav-pos/hub-electron typecheck`, `pnpm --filter @gaurav-pos/hub-electron lint`, and `git diff --check` passed.

## 2026-05-30 hub one-click updater DB safety hardening
- Task: Fixed review findings in the one-click online updater so valuable local SQLite data is protected before Electron updater downloads/installs.
- Online update safety: releases now include `hub-update-metadata.json`; Hub validates `appId`, platform, version, `dbSchemaVersion`, and `minSourceDbSchemaVersion` before download/install.
- Installer handoff: online update lock remains held after `quitAndInstall()` handoff, and Electron startup reuses one Hub runtime/updater instance across window recreation.
- Release workflow: fresh and publish scripts require `latest.yml`, installer `.exe`, `.exe.blockmap`, `hub-update-metadata.json`, and fallback `.gpos-update.zip`; publish dry-run validates metadata against the update package.
- Verification: targeted update tests, full hub test suite, typecheck, fresh release dry build, publish dry-run, and `git diff --check` passed.
