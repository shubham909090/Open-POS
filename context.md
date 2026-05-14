# Gaurav POS Context

This file is a handoff document for humans and AI tools. It describes what is actually present in this repository as of the current implementation. It avoids planned-only features unless they are called out as limitations.

## Product Goal

Gaurav POS is an offline-first restaurant point-of-sale system for Indian restaurant operations.

The core design choice is:

- The restaurant must keep taking orders, printing KOT/BOT, billing, and closing the day even when internet is down.
- The Windows hub PC inside the restaurant is the service-hour source of truth.
- Convex cloud is used for owner login, restaurant ownership, hub connection, synced audit events, command queue, and closed-day reports.

## Monorepo Shape

The repository is a pnpm TypeScript monorepo.

Main packages:

- `apps/hub-electron`: Windows hub app. This owns SQLite, Fastify API, local React UI, printer jobs, sync bridge, backups, and Electron packaging.
- `apps/mobile`: Expo React Native Android app for paired captain/waiter devices.
- `apps/cloud-admin`: Next.js owner portal using WorkOS AuthKit and Convex.
- `convex`: Convex backend schema, auth config, admin functions, sync functions, and HTTP endpoints.
- `packages/shared`: Shared roles, status types, Zod schemas, money/tax helpers, and table display state helpers.

Useful root scripts:

- `pnpm dev:hub`: build hub renderer and run hub server locally with `.env.local`.
- `pnpm dev:cloud`: run the cloud admin Next.js app.
- `pnpm test`: run workspace tests.
- `pnpm typecheck`: run workspace TypeScript checks.
- `pnpm lint`: run workspace lint scripts where present.
- `pnpm --filter @gaurav-pos/hub-electron package:win`: build Windows hub installer through electron-builder.
- `pnpm --filter @gaurav-pos/mobile android:apk`: create Android preview APK through EAS.

## Applications

### 1. Windows Hub App

Package: `apps/hub-electron`

The hub is the local restaurant machine. It runs on the cashier/admin Windows PC in production. In development it can run on macOS as a local Fastify server.

Responsibilities:

- Owns the local SQLite database.
- Runs Drizzle migrations at startup.
- Bridges old custom migration metadata into Drizzle metadata for existing dev hub DBs.
- Exposes a LAN REST API and WebSocket endpoint.
- Serves the local hub React UI.
- Stores local device tokens for offline authentication.
- Creates pairing QR/manual codes for phones.
- Manages floors, tables, kitchens/counters, dishes, sale/tax groups, ticket templates, manager PIN, printers, backups, and cloud sync.
- Runs the service flow: table selection, order entry, KOT/BOT creation, billing, payment recording, NC bills, revisions, and day close.
- Creates durable print jobs and retries failed jobs.
- Writes an append-only local event log and sync outbox.
- Uploads events/reports to Convex when internet is available.
- Pulls cloud support commands from Convex.

Hub UI sections in the React renderer:

- `Setup`: POS day open, floors, tables, kitchens/counters, dishes.
- `Take Orders`: floor/table view, menu, open items, table check, KOT/BOT send, table/item shift, bill panel.
- `Kitchen`: KDS ticket list and KOT/BOT status controls.
- `Reports & Backups`: day close summary, close day, local daily reports.
- `Advanced`: manager PIN, sale/tax groups, print text/template settings, printers/backups/sync support surfaces.

### 2. Android Mobile App

Package: `apps/mobile`

The mobile app is waiter/captain focused. It is not the billing/admin app.

Responsibilities:

- Connect to a hub URL on the restaurant LAN.
- Pair with the hub using QR scan, pasted QR payload, or manual code.
- Store the local device token with AsyncStorage.
- Refresh paired device role/name from `/devices/me`.
- Show connection status.
- Pick a floor/table.
- Search menu items.
- Add dishes and review new items before sending.
- Send finalized order items to the hub.
- Save local drafts when needed.
- View running table order from the hub.
- Captain-only: shift a full running table to another free table.
- Captain-only: shift selected sent items to another table.
- Captain/waiter scope only: no billing, reports, manager settings, or cloud admin features.
- Poll ready notifications from the hub for kitchen/bar ready alerts.

### 3. Cloud Admin App

Package: `apps/cloud-admin`

The cloud portal is for owner/admin/reporting work when internet exists. It is not part of the live order path.

Responsibilities:

- Google-only login through WorkOS AuthKit.
- List/create restaurants.
- Manage owner/admin/reporting memberships and invitations.
- Create a hub connection for a restaurant. This generates `POS_INSTALLATION_ID` and `POS_SYNC_SECRET` and shows an env block for the hub PC.
- Show hub installation health and recent synced events.
- Queue advanced support commands for the hub.
- Show cloud daily reports after the hub closes a POS day and syncs.

Cloud portal roles:

- `owner`: created when the restaurant is created; can manage restaurant setup, staff, and hub connection.
- `admin`: can manage restaurant setup/staff/hub connection.
- `reporting`: can view reports but not manage setup/staff/hub connection.

### 4. Convex Backend

Folder: `convex`

Convex is used for cloud-side account, sync, command queue, and reports.

Convex files:

- `convex/auth.config.ts`: WorkOS/Convex auth configuration.
- `convex/schema.ts`: Convex tables.
- `convex/admin.ts`: cloud admin queries/mutations.
- `convex/sync.ts`: sync ingestion, hub command queue, report upsert logic.
- `convex/http.ts`: HTTP endpoints used by the hub sync bridge.
- `convex/viewer.ts`: viewer/auth helper surface.

Convex HTTP endpoints:

- `POST /pos/ingest-events`: hub uploads local events. Authenticated by installation id and secret headers.
- `POST /pos/pull-hub-snapshot`: hub pulls queued cloud commands. Authenticated by installation id and secret headers.

## Current Roles And Permissions

Local hub/mobile device roles are defined in `packages/shared/src/types.ts`:

- `admin`
- `cashier`
- `captain`
- `waiter`
- `kitchen`

Current local permission model:

- `admin`: full hub setup/admin permissions, device pairing/revoke, sync, backups, settings, printer setup, day operations.
- `cashier`: POS day, order/billing/report/print operation permissions. Sensitive actions still require manager PIN where applicable.
- `captain`: mobile/floor service role. Can submit orders, view running orders, shift own open tables/items, and receive ready alerts.
- `waiter`: mobile/basic order-taking role. Can submit/view orders, cannot shift tables/items.
- `kitchen`: KDS role. Can view kitchen/bar tickets and update KOT/BOT statuses.

Important security rule:

- Hub endpoints derive actor identity from the authenticated local device token.
- The system does not trust client-sent `captainId`, `movedBy`, or cashier names for security decisions.
- Captain ownership is based on paired device identity.
- Captains can shift only their own open/running tables/items.
- Cashier/admin can correct valid table/item movement.

## Auth Model

There are two auth systems because cloud auth and restaurant service have different reliability needs.

### Cloud Auth

- WorkOS AuthKit.
- Google login only.
- Used by the cloud admin app.
- Convex uses authenticated identity from WorkOS JWT.
- Membership authorization is stored in Convex.

### Local Hub Auth

- Local long-lived device tokens.
- Token hashes stored in SQLite table `local_devices`.
- Works without internet.
- Pairing codes are created by the hub and exchanged by phones.
- The hub admin unlock token comes from `HUB_ADMIN_TOKEN`.

## Hub Pairing Flow

1. Admin unlocks the hub.
2. Admin creates a pairing code for a device name and role.
3. Hub generates:
   - a six-digit/manual code,
   - a QR data URL,
   - a QR payload text,
   - an expiry time.
4. Android app scans QR, pastes payload, or enters code manually.
5. Android calls `/devices/pair/exchange`.
6. Hub creates a `local_devices` row and returns the local token.
7. Android stores token locally and uses it for all future LAN requests.

Pairing codes expire and are one-time use.

## Local Database

The hub uses SQLite through `better-sqlite3` and Drizzle ORM.

Important rule:

- SQLite lives only on the hub PC.
- Android devices and other PCs never open the SQLite file directly.
- All local devices use the hub API.

Current local tables from `apps/hub-electron/src/db/drizzle-schema.ts`:

- `migrations`
- `pos_days`
- `daily_report_snapshots`
- `floors`
- `sale_groups`
- `restaurant_tables`
- `production_units`
- `menu_items`
- `orders`
- `order_items`
- `kots`
- `kot_items`
- `bills`
- `bill_revisions`
- `payments`
- `print_jobs`
- `manager_approvals`
- `order_movements`
- `ready_notifications`
- `event_log`
- `sync_outbox`
- `hub_settings`
- `ticket_templates`
- `local_devices`
- `pairing_codes`
- `idempotency_records`

Migration behavior:

- Drizzle migrations live in `apps/hub-electron/drizzle`.
- Hub startup runs Drizzle migrations.
- `HubDatabase` includes a compatibility bridge for old DBs that were created before Drizzle migration metadata existed. It marks already-present schemas as applied, then lets Drizzle run the remaining migrations.

## Restaurant Setup Data

### Floors And Tables

- UI uses the word `Floor`, not room.
- Tables belong to floors.
- Table statuses include `free`, `occupied`, `billed`, and `attention`.
- Shared display mapping in `packages/shared/src/table-state.ts` maps table state to:
  - `free`
  - `running`
  - `bill_printed`
  - `needs_attention`
  - `disabled`

Current table colour intent:

- Free: white/neutral.
- Running: amber.
- Bill printed/pending payment: blue.
- Disabled: disabled styling.

### Kitchens / Counters

The database/table name is `production_units`, but the user-facing concept is kitchen/counter.

Each kitchen/counter can store:

- name
- printer mode: `system` or `network`
- system printer name
- network printer host/port
- KDS enabled flag
- active flag

### Dishes

Menu item fields:

- name
- price in paise
- optional kitchen/counter
- sale group
- active flag

If a dish has no kitchen/counter:

- it can still be sold and billed,
- it does not generate a KOT/BOT until assigned to a kitchen/counter.

No modifier/spice/note-template catalog is currently part of the implemented basic dish setup.

### Sale / Tax Groups

Default seeded sale groups:

- Food: kind `food`, ticket label `KOT`, default tax components CGST 2.5% and SGST 2.5%.
- Alcohol: kind `alcohol`, ticket label `BOT`, default tax component VAT 10%.
- Beverage: kind `beverage`, ticket label `KOT`, default tax components CGST 2.5% and SGST 2.5%.
- Other: kind `other`, ticket label `KOT`, no default tax components.

Groups are configurable in the hub Advanced area.

Sale groups affect:

- tax calculation,
- ticket label KOT/BOT,
- reporting groups,
- open item classification,
- optional default kitchen/counter routing.

## Order Flow

1. POS day must be open.
2. User selects a table.
3. User adds menu dishes or open items.
4. Draft items are local UI state until sent.
5. Submit order calls `/orders/submit`.
6. Hub validates role and token.
7. Hub creates or updates the table's open order.
8. Hub stores item snapshots: name, price, sale group, tax info, ticket label, kitchen/counter.
9. Hub creates KOT/BOT only for items with a kitchen/counter.
10. Hub creates print jobs for generated KOT/BOT.
11. Hub appends events to `event_log` and `sync_outbox`.
12. Hub broadcasts realtime updates.
13. UI refetches from the hub; no domain-critical optimistic update should be trusted as final.

KOT/BOT types supported in shared types:

- `new`
- `modified`
- `partial_cancel`
- `cancelled`
- `reprint`

KOT/BOT statuses:

- `queued`
- `preparing`
- `ready`
- `served`
- `cancelled`

## Open Items

Open items are for off-menu sale entries.

Open item input can include:

- custom name
- price
- sale group
- optional kitchen/counter

Open items are stored as order item snapshots with nullable `menu_item_id`.

Important rule:

- Open items do not create hidden menu item rows.
- The Dishes setup list remains clean.
- Open items still print, bill, tax, and report using their snapshots.

## Table And Item Movement

Implemented movement:

- full table shift from one table to another free table,
- selected item/quantity shift from one table to another table.

Movement is available from:

- hub UI for cashier/admin correction,
- mobile APK for captain-owned open/running tables/items.

Movement behavior:

- Source and target orders are updated.
- Source table can be freed if its order becomes empty/cancelled.
- Movement audit is written to `order_movements`.
- Event is appended to `event_log`.
- Transfer KOT/BOT tickets are created where kitchen/bar context needs to remain aligned.

## Billing Flow

Billing happens from the selected table.

Main flow:

1. Select a running table.
2. Send required KOT/BOT items first.
3. Generate bill for the table/order.
4. Apply discount:
   - amount,
   - or percentage.
5. Add tip if needed.
6. Record one or more cashier-entered payments:
   - cash,
   - UPI,
   - card,
   - online.
7. Full payment quick buttons fill remaining balance for a method.
8. Punch bill only when payment covers the balance.
9. Hub records payments.
10. Bill becomes paid when covered.
11. Receipt print job is queued.
12. Table is freed/refreshed.

Payments are cashier-recorded external payments. There is no gateway integration currently.

Bill statuses in shared types:

- `pending`
- `paid`
- `void`
- `revised`

## Manager PIN And Sensitive Actions

Hub supports one shared manager PIN for v1.

Manager PIN storage:

- Stored in hub settings.
- New hashing uses salted PBKDF2 metadata.
- Existing legacy hash can be upgraded on successful verification.

Manager approval payload contains:

- PIN
- reason
- approvedBy

Manager PIN is required for:

- cancel/remove order,
- KOT reprint,
- bill reprint/regeneration,
- bill revision,
- NC bill marking,
- protected item/price correction paths where included in schemas.

Approvals are audited in `manager_approvals` with action, aggregate, reason, approver/requester, and timestamp.

## Bill Revision

Implemented revision behavior:

- Cashier/admin can enter revision mode from a generated/printed bill.
- Manager PIN and reason are required.
- User can add/subtract items.
- Hub records a new bill revision in `bill_revisions`.
- Latest revision is used for settlement/reprint.
- Revised KOT/BOT is queued where item changes affect kitchen/bar.
- Revision is blocked after any normal payment has been recorded.
- NC bills cannot be revised through the normal revision button.

## NC Bills

NC means Non Customer / non-chargeable bill.

Implemented behavior:

- Requires manager PIN and reason.
- Prints like a normal bill.
- Counts item quantities in usage reports.
- Excludes sale/tax/payment totals from sales reporting.
- NC marking is blocked after normal payment has been recorded.

## Printing

Implemented print concepts:

- KOT: Kitchen Order Ticket.
- BOT: Bar Order Ticket.
- Bill: customer receipt.
- KOT/BOT label comes from sale group/ticket label and kitchen/counter routing.

Print jobs are durable rows in `print_jobs`.

Print job statuses:

- `pending`
- `printing`
- `printed`
- `failed`

Printer support:

- system printer mode for installed OS printers,
- network printer mode with host/port for ESC/POS style LAN printers,
- dry-run mode through config for development,
- retry endpoint for failed jobs,
- event logging for print failures.

Ticket template settings:

- restaurant name
- tax registration text
- bill header
- bill footer
- KOT/BOT header
- KOT/BOT footer

Known operational requirement:

- Real printer hardware still needs to be tested on the actual Windows restaurant PC with the restaurant's cash counter, kitchen, and bar printers.

## Kitchen / KDS Flow

Kitchen role can access KDS routes.

Flow:

1. Hub creates KOT/BOT tickets for kitchen/counter-assigned items.
2. Kitchen screen lists tickets for a production unit.
3. Kitchen can update ticket status to preparing, ready, served, or cancelled.
4. When a ticket becomes ready, hub creates ready notification rows for the relevant captain/device where possible.
5. Mobile app polls ready notifications and shows alerts.

No OS push notification service is currently implemented; ready alerts are hub-polled.

## Day Close And Reports

Hub day close computes and stores a finalized local report snapshot.

Close summary/report includes:

- business date,
- opening cash,
- closing cash entered,
- expected closing cash,
- cash variance,
- bill count,
- gross sales,
- discounts,
- tips,
- final sales,
- payment split: cash, UPI, card, online,
- total/non-cash payments,
- open/billed/paid/unpaid/cancelled counts,
- bill summaries,
- item summaries,
- sale group summaries,
- NC quantities and NC gross amounts separately.

Rules:

- Day close is blocked while open/billed orders remain unsettled or uncancelled.
- Day close saves report locally.
- Day close queues a `daily_report.finalized` style synced event through the event/outbox flow.
- Cloud sync attempts when internet is available, but local day close is not intended to depend on internet.

Cloud reports:

- stored in Convex `dailyReports`,
- bill details in `dailyReportBills`,
- item summaries in `dailyReportItems`,
- group summaries in `dailyReportGroups`,
- visible in Cloud Admin Reports tab after sync.

## Cloud Sync

Hub-to-cloud push:

1. Local domain actions append events to `event_log`.
2. Events to sync are inserted into `sync_outbox`.
3. `ConvexSyncBridge.pushPending()` posts to Convex HTTP `/pos/ingest-events`.
4. Convex authenticates with `POS_INSTALLATION_ID` and `POS_SYNC_SECRET`.
5. Convex stores immutable `syncedEvents`.
6. Daily report events upsert cloud report tables.
7. Hub marks outbox rows synced or failed.

Cloud-to-hub pull:

1. Cloud admin queues commands into Convex `hubCommands`.
2. Hub calls `/pos/pull-hub-snapshot`.
3. Hub applies commands locally.
4. Cursor is stored in hub settings as `cloud_snapshot_cursor`.

Supported cloud command types:

- `device.revoked`
- `device.updated`
- `menu_item.upsert`
- `menu_item.disabled`
- `production_unit.upsert`
- `receipt_printer.updated`

Device commands use canonical payload field `hubDeviceId`.

## Hub REST API

The hub API is in `apps/hub-electron/src/api/server.ts`.

Routes currently registered:

- `GET /health`
- `POST /devices/pair/exchange`
- `GET /sync/bootstrap`
- `GET /sync/status`
- `POST /sync/push`
- `POST /sync/pull`
- `GET /floors`
- `POST /floors`
- `PATCH /floors/:id`
- `DELETE /floors/:id`
- `GET /tables`
- `POST /tables`
- `PATCH /tables/:id`
- `DELETE /tables/:id`
- `GET /tables/:id/order`
- `GET /production-units`
- `GET /sale-groups`
- `POST /sale-groups`
- `PATCH /sale-groups/:id`
- `POST /production-units`
- `PATCH /production-units/:id`
- `DELETE /production-units/:id`
- `GET /menu-items`
- `POST /menu-items`
- `PATCH /menu-items/:id/active`
- `DELETE /menu-items/:id`
- `PATCH /menu-items/:id`
- `GET /settings/receipt-printer`
- `GET /system-printers`
- `PUT /settings/receipt-printer`
- `PUT /settings/manager-pin`
- `GET /settings/ticket-template`
- `PUT /settings/ticket-template`
- `GET /devices`
- `POST /devices/pairing-codes`
- `POST /devices/:id/revoke`
- `GET /devices/me`
- `GET /kds/:productionUnitId`
- `PATCH /kot/:id/status`
- `GET /orders/:id`
- `GET /notifications/ready`
- `GET /realtime` WebSocket
- `POST /pos-days/open`
- `POST /pos-days/close`
- `GET /pos-days/close-summary`
- `GET /reports/daily`
- `GET /reports/daily/:posDayId`
- `POST /orders/submit`
- `POST /tables/move`
- `POST /orders/items/move`
- `POST /orders/:id/cancel`
- `POST /kot/:id/reprint`
- `POST /bills/:billId/reprint`
- `POST /bills/:billId/print`
- `POST /bills/:billId/revise`
- `POST /bills/:billId/nc`
- `POST /bills/:orderId/generate`
- `POST /bills/:billId/settle`
- `POST /print-jobs/process`
- `GET /print-jobs`
- `POST /print-jobs/:id/retry`
- `GET /backups`
- `POST /backups`
- `POST /backups/restore`

## Convex Schema

Cloud tables from `convex/schema.ts`:

- `restaurants`
- `memberships`
- `memberInvitations`
- `devices`
- `installations`
- `hubCommands`
- `syncedEvents`
- `dailyReports`
- `dailyReportBills`
- `dailyReportItems`
- `dailyReportGroups`

## Local Environment Variables

Hub production config is loaded from environment variables and/or hub env files. See `docs/packaging/restaurant-handoff.md` for the full order.

Important hub variables:

- `HUB_HOST`: usually `0.0.0.0` for LAN access.
- `HUB_PORT`: default app port, commonly `3737`.
- `HUB_PUBLIC_URL`: LAN URL phones should use, for example `http://192.168.1.20:3737`.
- `HUB_DATABASE_PATH`: SQLite file path.
- `HUB_BACKUP_DIR`: local backup folder.
- `HUB_PRINTER_DRY_RUN`: `true` for development/no real printing, `false` for restaurant printer use.
- `HUB_ADMIN_TOKEN`: long local admin unlock token.
- `CONVEX_HTTP_URL`: Convex site HTTP URL for sync endpoints.
- `POS_INSTALLATION_ID`: generated in cloud portal when connecting a hub.
- `POS_SYNC_SECRET`: generated in cloud portal when connecting a hub.

Cloud/WorkOS envs are documented in `docs/workos-authkit-setup.md`.

## Backups

Hub includes a backup service:

- list backups,
- create backup,
- schedule restore.

Backups are local to the hub PC. Cloud Convex is not the SQLite backup mechanism.

## Known Current Limitations / Reality Checks

These are not hallucinated features; they are current operational notes:

- Real restaurant printer hardware must still be tested on Windows with actual installed/network printers.
- Mobile ready alerts are polling-based, not native push notifications.
- Cloud admin has a `dev` and `typecheck` script, but no package-level `build` script in `apps/cloud-admin/package.json`.
- Hub is the live source of truth; cloud reports appear after hub day close and sync.
- The system is not a payment gateway; UPI/card/online payments are manually recorded by cashier.
- Convex cloud is not used as the live order database.
- SQLite should not be shared over a network file system.

## Verification Commands Recently Used

These commands have passed after the latest fixes:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @gaurav-pos/hub-electron build`
- `node --check apps/hub-electron/src/public/app.js`
- `npx tsc --noEmit --project convex/tsconfig.json`

