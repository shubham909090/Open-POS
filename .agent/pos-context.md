# POS Context

Last updated: 2026-05-10

## Product Goal

Build an offline-first restaurant POS for Indian restaurants and bars. The first restaurant target is the user's brother's restaurant, but the architecture should be clean enough to later sell as SaaS/on-prem hybrid software to other restaurants.

The operational priority is simple: restaurant service must continue when internet is down. Cloud should improve reporting, backups, account management, and future SaaS operations, but it must not sit in the live order/KOT/billing path.

## Chosen Architecture

- Windows cashier/admin PC runs the local hub.
- Android waiter/cashier devices connect to the local hub over restaurant Wi-Fi/LAN.
- Printers are primarily PC-installed system printers selected from the hub. LAN ESC/POS by static IP remains an advanced fallback.
- Convex is the cloud system for SaaS admin, device/account metadata, synced event backup, and reporting.
- SQLite exists only inside the hub process. Never place a SQLite database file on a shared network drive or open it from multiple devices.

```text
Android waiter/cashier apps
        |
        | LAN HTTP + WebSocket
        v
Windows Electron Hub
- SQLite
- local REST/WebSocket API
- KOT/billing/table authority
- print queue
- sync outbox
        |
        | TCP/IP ESC/POS
        v
Kitchen/bar printers + KDS screens

Internet available?
        |
        v
Convex cloud backup/reporting/SaaS admin
```

## Current Implementation

The repo is now a pnpm monorepo:

- `apps/hub-electron`: local hub runtime and domain implementation.
- `apps/mobile`: Expo React Native Android waiter app shell.
- `apps/cloud-admin`: Next.js cloud admin shell.
- `packages/shared`: shared TypeScript types, Zod schemas, money helpers.
- `convex`: initial cloud schema and event ingestion mutation.
- `docs/reference-intake.md`: open-source POS reference notes.

The hub currently implements:

- Drizzle ORM schema/config for the local SQLite database.
- Drizzle migration runner and demo seed data wired through the Drizzle database handle.
- POS day open/close.
- Static cashier/admin UI served at the hub root.
- Electron desktop shell via `pnpm --filter @gaurav-pos/hub-electron dev:desktop`.
- Hub UI is split into Setup, Service, Kitchen, and Billing screens instead of one crammed dashboard.
- Floor/table setup APIs.
- Production-unit and menu setup APIs.
- Modifier group, modifier option, menu-item modifier assignment, and note-template setup APIs.
- In-app setup forms for floors, tables, production units, menu items, receipt printer, and device pairing codes.
- In-app setup forms for modifier groups/options, attaching modifiers to dishes, and reusable kitchen note templates.
- Pairing-code creation returns a six-digit fallback code plus a QR data URL/payload for Android scanner pairing.
- Receipt/cashier printer setting and bill print routing.
- System printer discovery endpoint lists printers installed on the hub PC; selected OS printer names are stored for receipt and production-unit routing.
- Local device token auth, role checks, pairing-code creation/exchange, device listing, and device revocation.
- Device list/revoke controls in Setup.
- Menu edit/enable/disable controls in Setup.
- Cash reconciliation summary before POS day close.
- Hot SQLite backup creation, backup listing, and restart-based restore scheduling.
- Windows NSIS packaging scaffold via Electron Builder.
- Table list/bootstrap and active table order lookup.
- Order submit to a table.
- New, modified, partial-cancel, cancelled, and reprint KOT foundations.
- KDS view by production unit with `queued`, `preparing`, `ready`, and `served` status transitions.
- Production-unit routing to kitchen/bar printers.
- Print-job queue with list, retry, and retryable `pending`, `printing`, `printed`, `failed` states.
- Bill generation and cash settlement.
- Manual bill settlement with discount, tip, full cash/UPI/card/online payments, split payments, and remaining-balance tracking. No payment gateway integration is involved.
- Menu modifiers affect order item price snapshots, KOT notes, and bill subtotal math. Reusable note templates can be applied from hub and Android order entry.
- Bill reprint, KOT reprint, and POS day close from the hub UI.
- Append-only `event_log` and `sync_outbox` for Convex sync.
- Convex HTTP sync bridge route at `/sync/push`; background push attempts every 60 seconds when `CONVEX_HTTP_URL` and `POS_SYNC_SECRET` are set.
- Convex installation identity and `/sync/pull` cloud-to-hub command pull for device, menu, production-unit, and printer-setting changes.
- Fastify REST API plus token-protected WebSocket realtime endpoint.
- Drizzle-backed auth, idempotency, print queue processing, Convex outbox reads/updates, seed data, schema generation, POS-day writes, order/KOT write clusters, billing/payment writes, print-job enqueue, and event/outbox appends.

The Android app currently implements:

- Expo/React Native shell.
- Manual hub URL setting.
- Manual device token setting and pairing-code exchange.
- QR scanner pairing through `expo-camera`, plus manual QR payload paste fallback.
- Hub health polling.
- Table list and menu list from hub bootstrap.
- Ticket-line kitchen notes.
- Modifier chips and note-template chips from hub bootstrap.
- Final KOT review prompt before sending an online order.
- Offline draft order storage in AsyncStorage.
- Hub-confirmed order/KOT submission when online.

The cloud admin currently implements:

- Next.js App Router shell.
- WorkOS AuthKit client session and Convex auth provider bridge.
- Google-only sign-in route expectation.
- Authenticated cloud admin dashboard split into Setup, Staff, Menu & Devices, and Sync Health sections.
- Convex schema for restaurants, memberships, member invitations, devices, installations, hub commands, synced events, and daily reports.
- Authenticated cloud UI for creating restaurants, registering hub installation identities, inviting/removing staff, accepting staff invitations, listing installations/recent events, and queueing guided cloud-to-hub commands.
- Convex HTTP event ingestion boundary protected by `POS_SYNC_SECRET`.

## Device-By-Device UX Scope

Windows hub/cashier/admin:

- Setup tab handles POS day, printer selection, room/table setup, kitchen/menu setup, device pairing/revoke, backups, and cloud sync controls.
- Setup tab also handles modifier groups/options, assigning modifiers to dishes, and reusable note templates.
- Business day setup includes close reconciliation with opening cash, cash sales, expected drawer cash, typed cash variance, UPI/card/online totals, gross/final sales, discounts, tips, paid bills, unpaid bills, and open-order blockers.
- Service tab handles table status, waiter-style order entry, menu search, ticket total, and KOT submission.
- Kitchen tab shows KOT/KDS work and print queue actions.
- Billing tab shows selected order context, bill generation/reprint, discount, tip, split payments, balance, and settlement.

Android waiter device:

- First screen area handles hub URL, device token, QR/manual pairing, and live connection status.
- Table grid selects the active table.
- Order area handles captain/pax, menu search, item add, modifier chips, note templates, kitchen notes, quantity edits, ticket total, and final KOT review before sending.
- Offline mode saves a local draft; final KOT needs hub confirmation.

Cloud admin:

- Setup section creates the restaurant and registers the Windows hub installation identity.
- Staff section creates email-based invitations, accepts pending invites for the signed-in Google email, updates member roles, removes non-owner members, and revokes pending invites.
- Menu & Devices section queues guided cloud-to-hub changes for menu items, production units, receipt printer, device role/name updates, and device revoke.
- Sync Health section shows registered hubs, recent synced events, and the next command the hub will pull.

## Important Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:hub
pnpm --filter @gaurav-pos/hub-electron dev:desktop
pnpm --filter @gaurav-pos/hub-electron db:generate
pnpm --filter @gaurav-pos/hub-electron db:studio
pnpm --filter @gaurav-pos/hub-electron build
pnpm --filter @gaurav-pos/hub-electron package:win
pnpm --filter @gaurav-pos/mobile dev
pnpm dev:cloud
```

The hub defaults to `http://localhost:3737`. Android devices on the same LAN should use the Windows hub LAN IP, for example `http://192.168.1.20:3737`. Set `HUB_PUBLIC_URL` to that LAN URL so generated pairing QR codes do not accidentally point Android devices at `localhost`.

In development, the hub seeds `dev-admin-token` unless `NODE_ENV=production`. In production set `HUB_ADMIN_TOKEN` and create paired device tokens from the hub UI.

If `better-sqlite3` binding is missing after install, run:

```bash
npm run install --prefix node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3
```

The root `package.json` allows build scripts only for `better-sqlite3` and `esbuild`.

## Reference Repos

Reference repos live outside the product in `/Users/shubhamtemak/Documents/ExampleRepos`:

- `ury`: best Indian restaurant reference for POS opening/closing, KOT lifecycle, production units, printer routing, KDS.
- `mysagra`: useful for kitchen/bar workstation splitting and event-style printer flow.
- `olgax-pos`: useful TypeScript/offline/receipt/auth/reference patterns; MIT licensed.
- `node-escpos-driver`: useful ESC/POS adapter reference.
- Floreant was not cloned because local `svn` is unavailable; treat public docs as reference only.

Do not blindly copy AGPL/MRPL code into this product. Use those repos as behavior/design references unless license review says otherwise.

## Architecture Rules

- Local hub is the service-hour source of truth.
- Drizzle is the SQLite ORM/schema/migration layer for the hub. Use `apps/hub-electron/src/db/drizzle-schema.ts` before adding/changing local tables, then generate migrations into `apps/hub-electron/drizzle`.
- Convex is not in the hot path for order/KOT/billing.
- Every finalized local mutation must write domain state, `event_log`, and `sync_outbox` in one SQLite transaction.
- Print jobs are durable and retryable; printing failure must not erase order/KOT state.
- Android devices may cache menu/table data and save drafts when disconnected from the hub, but final order/KOT/bill actions require hub confirmation.
- Printer routing is via production units: kitchen, bar, tandoor, etc.
- Prefer simple, direct modules over abstract architecture layers.

## Auth Decision

Use one cloud identity layer and one local service-session layer:

- Cloud identity: WorkOS AuthKit integrated with Convex, with Google sign-in only.
- Cloud auth owns restaurant accounts, owners/admins, staff users, device enrollment, and tenant isolation.
- Local hub auth owns offline service-hour sessions after setup.
- Devices are paired to the hub using a QR/manual code while authenticated/enrolled.
- The hub issues long-lived local device tokens for LAN use.
- Local permissions are derived from the last synced cloud role snapshot and enforced by the hub while offline.
- When internet returns, hub sync refreshes users/roles/device revocation state from Convex.

This gives one unified account system while still letting restaurant operations continue offline.

## Open Decisions

- Receipt/cashier printer destination exists as a hub setting; it still needs hardware validation with the restaurant's actual printer.
- Real PC-connected printer selection exists, but print output still needs validation on the actual Windows printer hardware.
- Exact Android release path: Expo shell exists; decide Expo dev client vs bare/native build before hardware testing.
- Electron UI framework: current hub UI is static HTML/JS served by Fastify inside Electron; migrate to Vite + React only if the UI complexity justifies it.
- Cloud admin framework: Next.js App Router + Convex + WorkOS AuthKit scaffold exists.
- Hardware printer protocol needs restaurant hardware testing before replacing the current minimal TCP ESC/POS adapter.
- Tax/service charge rules need real restaurant requirements before finalizing bill math.
- Local pairing/auth exists, but the hub should still only be exposed on the restaurant LAN, not the public internet.
- Restaurant-specific GST/service-charge rules still need the user's real billing policy before finalization.
- `OrderService` uses Drizzle query APIs for the write-heavy service-hour mutation path. Some read-heavy list/report joins still use prepared SQL for compactness; keep tests green if cleaning those up later.
- Windows packaging is configured, but `package:win` must run on Windows hardware/CI because `better-sqlite3` cannot be cross-compiled from macOS.
