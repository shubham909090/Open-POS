# Gaurav POS Context

This file is a handoff document for humans and AI tools. It describes what is actually present in this repository as of the current implementation. It avoids planned-only features unless they are called out as limitations.

## Product Goal

Gaurav POS is an offline-first restaurant point-of-sale system for Indian restaurant operations.

The core design choice is:

- The restaurant must keep taking orders, printing KOT/BOT, billing, and finalizing reports even when internet is down.
- The Windows hub PC inside the restaurant is the service-hour source of truth.
- Convex cloud is used for owner login, restaurant ownership, hub connection, synced audit events, command queue, and finalized business-day reports.

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

The hub is the local restaurant machine. It runs on the admin Windows PC in production. In development it can run on macOS as a local Fastify server.

Responsibilities:

- Owns the local SQLite database.
- Runs Drizzle migrations at startup.
- Exposes a LAN REST API and WebSocket endpoint.
- Serves the local hub React UI.
- Stores local device tokens for offline authentication.
- Creates pairing QR/manual codes for phones.
- Manages floors, tables, kitchens/counters, dishes, sale/tax groups, per-printer print layouts, manager PIN, printers, backups, and cloud sync.
- Runs the service flow: table selection, order entry, KOT/BOT creation, billing, payment recording, NC bills, revisions, and automatic 6 AM IST business-day reporting.
- Creates durable print jobs and retries failed jobs.
- Writes an append-only local event log and sync outbox.
- Uploads events/reports to Convex when internet is available.
- Pulls cloud support commands from Convex.

Hub UI sections in the React renderer:

- `Setup`: automatic business-day status, floors, tables, kitchens/counters, dishes.
- `Take Orders`: floor/table view, fuzzy menu search, recent/popular quick picks, open items, table check, KOT/BOT send, table/item shift, bill panel.
- `Kitchen`: KDS ticket list and KOT/BOT status controls.
- `Reports & Backups`: current business-day summary, finalized local daily reports, and backups.
- `Advanced`: manager PIN, sale/tax groups, print text/template settings, printers/backups/sync support surfaces.

### 2. Android Mobile App

Package: `apps/mobile`

The mobile app is waiter/captain focused. It is not the setup/cloud-admin app.

Responsibilities:

- Connect to a hub URL on the restaurant LAN.
- Pair with the hub using QR scan, pasted QR payload, or manual code.
- Store the local device token with AsyncStorage.
- Refresh paired device role/name from `/devices/me`.
- Show connection status.
- Pick a floor/table.
- Search menu items with shared Fuse.js fuzzy search across dish name, sale group, kitchen/counter, and variation labels.
- Use recent and popular-today quick picks before scrolling the full menu.
- Add dishes and review new items before sending.
- Send finalized order items to the hub.
- Save local drafts when needed.
- View running table order from the hub.
- Captain-only: shift any running table to another free table.
- Captain-only: shift selected sent items from any running table to another table.
- Captain-only: generate bills, print/reprint through the hub printer, record cash/UPI/card/online/split payments, add discount/tip, mark NC with Manager PIN, and view the current business-day summary.
- Waiter scope only: no billing, reports, movement, manager settings, or cloud admin features.
- Poll ready notifications from the hub for kitchen/bar ready alerts.

### 3. Cloud Admin App

Package: `apps/cloud-admin`

The cloud portal is for owner/admin/reporting work when internet exists. It is not part of the live order path.

Responsibilities:

- Google-only login through WorkOS AuthKit.
- List/create restaurants.
- Manage owner/admin/reporting memberships and invitations.
- Create a hub connection for a restaurant. This generates the hub connection ID and sync secret that are pasted into the hub UI.
- Show hub installation health and recent synced events.
- Queue advanced support commands for the hub.
- Show cloud daily reports after the hub finalizes a 6 AM IST business day and syncs.

Cloud portal roles:

- `owner`: created when the restaurant is created; can manage restaurant setup, staff, and create/revoke hub connections.
- `admin`: can manage staff/setup/support commands, but cannot create a new hub connection. Hub connection creation is owner-only.
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
- `captain`
- `waiter`
- `kitchen`

Current local permission model:

- `admin`: full hub setup/admin permissions, device pairing/revoke, sync, backups, settings, printer setup, and reports.
- `captain`: full restaurant operations role. Can submit orders, bill/settle/print, view current reports, adjust alcohol stock with Manager PIN, shift any running table/items from APK, and receive ready alerts.
- `waiter`: mobile/basic order-taking role. Can submit/view orders, cannot shift tables/items.
- `kitchen`: KDS role. Can view kitchen/bar tickets and update KOT/BOT statuses.

Authority matrix:

| Capability | admin | captain | waiter | kitchen |
| --- | --- | --- | --- | --- |
| Unlock hub / use local admin token | yes | no | no | no |
| Pair/revoke local devices | yes | no | no | no |
| Manage floors/tables/kitchens/dishes/sale groups | yes | no | no | no |
| Manage printers/templates/manager PIN/backups/sync tools | yes | no | no | no |
| View basic setup/catalog data | yes | yes | yes | yes |
| View full table/order with bill, payments, KOT/BOT | yes | yes | no | no |
| View running table order without bill/payment/KOT details | yes | yes | yes | no |
| Submit table orders / open items | yes | yes | yes | no |
| Move full table / selected items | yes | any running table/items | no | no |
| Generate, print, revise, settle, NC, reprint bills | yes | yes | no | no |
| Cancel/remove orders | yes, manager PIN required | yes, manager PIN required | no | no |
| Reprint KOT/BOT | yes, manager PIN required | yes, manager PIN required | no | no |
| View current reports and alcohol stock reports | yes | yes | no | no |
| Adjust alcohol stock | yes, manager PIN required | yes, manager PIN required | no | no |
| View KDS tickets and mark status | yes | no | no | yes |
| Receive ready notifications | yes | yes | yes | no |

Important security rule:

- Hub endpoints derive actor identity from the authenticated local device token.
- The system does not trust client-sent `captainId`, `movedBy`, or display names for security decisions.
- Captain identity is still based on paired device identity for order audit and ready notifications.
- Captains can shift any running/open table or selected items, regardless of who first opened the table.
- Admin can also move billed tables for manager correction; captain movement remains running-table scoped.

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
- The hub setup session is unlocked with the local Manager PIN. Env admin tokens are developer/recovery fallback only.

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
- `local_devices`
- `pairing_codes`
- `idempotency_records`

Migration behavior:

- Drizzle migrations live in `apps/hub-electron/drizzle`.
- Hub startup runs Drizzle migrations.
- The product is still in development and has no production users yet, so the repo does not keep legacy SQLite compatibility bridges. If an old local dev DB conflicts with current migrations, delete/recreate the dev DB instead of adding backwards-compatibility code.

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
- internal sellable variants in `menu_item_variants`

If a dish has no kitchen/counter:

- it can still be sold and billed,
- it does not generate a KOT/BOT until assigned to a kitchen/counter.

No modifier/spice/note-template catalog is currently part of the implemented basic dish setup.

### Alcohol Catalog And Stock

Alcohol is managed as a dedicated Hub feature while still selling under the Alcohol sale group/BOT flow.

Alcohol item types:

- `plain_liquor`: stock-managed bottle/shot liquor.
- `prepared_product`: cocktail/alcohol product sold like a normal menu item, with optional liquor recipe ingredients.

Plain liquor uses variants for sellable prices:

- shot, usually 30 ml, deducts large/open stock,
- small bottle, deducts sealed small bottle count,
- large bottle, deducts sealed large bottle count.

Prepared alcohol products use one regular/default non-stock variant. Their recipe can list one or more plain liquors with ml per sold unit.

Stock rules:

- Alcohol stock is local Hub-only for v1.
- Stock is deducted only when a bill is paid/settled.
- Pending unpaid orders show as pending expected usage on the Storage tab.
- Shots and cocktails consume open large ml first, then auto-open sealed large bottles, then allow negative open ml if insufficient.
- Small bottle sales reduce sealed small count.
- Large bottle sales reduce sealed large count.
- Manual stock edits require Manager PIN.

Important snapshot rule:

- `order_items` stores variant label/volume, inventory action, unit price, tax/group/routing snapshots, and `alcohol_recipe_snapshot_json`.
- Settlement and pending stock use the order-time recipe snapshot, not the current live cocktail recipe.
- Catalog/recipe/price edits must not rewrite old open order or printed bill line values.

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

1. The hub automatically assigns the order to the current 6 AM IST business day.
2. User selects a table.
3. User adds menu dishes or open items.
4. Draft items are local UI state until sent.
5. Submit order calls `/orders/submit`.
6. Hub validates role and token.
7. Hub creates or updates the table's open order.
8. Hub stores item snapshots: name, price, variant, sale group, tax info, ticket label, kitchen/counter, inventory action, and alcohol recipe where relevant.
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

Menu catalog items also snapshot their sellable values at order time. Normal client order payloads submit menu item id + variant id; the Hub service resolves and stores the authoritative price.

## Table And Item Movement

Implemented movement:

- full table shift from one table to another free table,
- selected item/quantity shift from one table to another table.

Movement is available from:

- hub UI for admin correction,
- mobile APK for captain-owned open/running tables/items.

Movement behavior:

- Source and target orders are updated.
- Source table can be freed if its order becomes empty/cancelled.
- Movement audit is written to `order_movements`.
- Event is appended to `event_log`.
- Transfer KOT/BOT tickets are created where kitchen/bar context needs to remain aligned.
- Selected item movement copies the source order-item snapshot.
- A moved item merges into an existing target row only if the full snapshot matches, including price, variant, recipe, tax, group, and routing.

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
6. Record one or more captain-entered payments:
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

Payments are captain-recorded external payments. There is no gateway integration currently.

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

- Admin and captain can enter revision mode from a generated/printed bill.
- Manager PIN and reason are required.
- User can add/subtract items.
- Hub records a new bill revision in `bill_revisions`.
- Latest revision is used for settlement/reprint.
- Revised KOT/BOT is queued where item changes affect kitchen/bar.
- Revision is blocked after any normal payment has been recorded.
- NC bills cannot be revised through the normal revision button.
- Existing printed bill lines submitted with their `orderItemId` preserve the original price, variant, recipe, tax/group, and routing snapshots unless the request explicitly performs a manager-approved edit.
- Catalog price or recipe changes after bill print must not reprice old bill lines during quantity-only revision.

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
- global Printer Test/Live Mode stored in local hub settings,
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

## Business Day And Reports

The hub uses a Petpooja-style automatic business day:

- every business day starts at 6:00 AM IST,
- every business day ends at the next 6:00 AM IST,
- staff do not manually open or close the day,
- new orders after 6:00 AM IST go into the new business date.

When the boundary has passed, the hub automatically finalizes old settled business days. If an old business day still has open or billed tables, the hub waits until those tables are paid or cancelled, then finalizes that day.

Current/finalized summary includes:

- business date,
- period start/end,
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

- Report finalization waits while open/billed orders remain unsettled or uncancelled.
- Finalization saves the report locally.
- Finalization queues a `daily_report.finalized` synced event through the event/outbox flow.
- Cloud sync attempts when internet is available, but local finalization does not depend on internet.

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
4. Convex authenticates with the hub connection/installation ID and sync secret stored in local hub settings.
5. Convex stores immutable `syncedEvents`.
6. Daily report events upsert cloud report tables.
7. Hub marks outbox rows synced or failed.

Cloud-to-hub pull:

1. Cloud admin queues commands into Convex `hubCommands`.
2. Hub calls `/pos/pull-hub-snapshot`.
3. Hub applies commands locally one by one.
4. Cursor is stored in hub settings as `cloud_snapshot_cursor`.
5. If a command fails, the hub records it in local command failures, continues with later commands, and shows the warning in Hub Advanced support tools.
6. Operators should fix the cloud setup, send a new update, and mark the old failure resolved in the hub once it no longer matters.

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
- `POST /sync/requeue-failed`
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
- `GET /alcohol`
- `GET /alcohol/storage`
- `POST /alcohol/items`
- `PATCH /alcohol/items/:id`
- `POST /alcohol/stock/:id/adjust`
- `GET /settings/receipt-printer`
- `GET /settings/printer-mode`
- `PUT /settings/printer-mode`
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
- `GET /business-day/current-summary`
- `GET /reports/daily`
- `GET /reports/daily/:posDayId`
- `GET /reports/alcohol-stock-movements`
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
- `POST /print-jobs/test-bill`
- `POST /print-jobs/test-kot`
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

## Hub Local Settings And Environment

Normal restaurant setup is done inside the hub UI, not by editing `hub.env`.

Fresh hub setup:

1. Create a Manager PIN on the hub PC itself. First PIN creation is blocked from other LAN devices.
2. Unlock setup with that PIN.
3. Save cloud connection values in **Setup → Hub Connection And Security**.
4. Save the hub public LAN URL, for example `http://192.168.1.20:3737`.
5. Use **Test cloud connection** before service.

SQLite `hub_settings` stores:

- cloud URL
- hub connection/installation ID
- sync secret
- hub public URL
- printer output mode
- receipt printer config
- per-printer print layouts
- Manager PIN hash

The Manager PIN is hashed; the raw PIN cannot be read back. It unlocks setup and approves sensitive actions.

Environment variables and `hub.env` remain developer/recovery fallbacks only. See `docs/packaging/restaurant-handoff.md`.

Core fallback variables:

- `HUB_HOST`: usually `0.0.0.0` for LAN access.
- `HUB_PORT`: default app port, commonly `3737`.
- `HUB_DATABASE_PATH`: SQLite file path.
- `HUB_BACKUP_DIR`: local backup folder.
- Optional recovery only: `HUB_PUBLIC_URL`, `CONVEX_HTTP_URL`, `POS_INSTALLATION_ID`, `POS_SYNC_SECRET`.

Printer output mode is changed in Hub → Setup → Printer Mode And Cash Counter. Fresh installs default to Test Mode; Live Mode sends real KOT/BOT/bill prints to configured printers. `HUB_PRINTER_DRY_RUN` may still be read as an old developer fallback on first start, but it is not the restaurant setup workflow.

Print layouts are guided settings, not raw templates. There is a cash-counter bill layout and per kitchen/counter KOT/BOT layouts. Each layout can set width, header/footer, restaurant/tax text, common show/hide fields, feed lines, preview, and test print.

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
- Hub is the live source of truth; cloud reports appear after the hub finalizes a 6 AM IST business day and syncs.
- The system is not a payment gateway; UPI/card/online payments are manually recorded by captain.
- Convex cloud is not used as the live order database.
- SQLite should not be shared over a network file system.

## Verification Commands Recently Used

These commands have passed after the latest fixes:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @gaurav-pos/cloud-admin build`
- `pnpm --filter @gaurav-pos/hub-electron build`
- `node --check apps/hub-electron/src/public/app.js`
- `npx tsc --noEmit --project convex/tsconfig.json`
