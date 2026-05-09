# POS Context

Last updated: 2026-05-09

## Product Goal

Build an offline-first restaurant POS for Indian restaurants and bars. The first restaurant target is the user's brother's restaurant, but the architecture should be clean enough to later sell as SaaS/on-prem hybrid software to other restaurants.

The operational priority is simple: restaurant service must continue when internet is down. Cloud should improve reporting, backups, account management, and future SaaS operations, but it must not sit in the live order/KOT/billing path.

## Chosen Architecture

- Windows cashier/admin PC runs the local hub.
- Android waiter/cashier devices connect to the local hub over restaurant Wi-Fi/LAN.
- LAN ESC/POS printers are addressed by static IP or DHCP reservation.
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
- `apps/mobile`: placeholder React Native Android app shell.
- `apps/cloud-admin`: placeholder cloud admin shell.
- `packages/shared`: shared TypeScript types, Zod schemas, money helpers.
- `convex`: initial cloud schema and event ingestion mutation.
- `docs/reference-intake.md`: open-source POS reference notes.

The hub currently implements:

- SQLite migration runner and demo seed data.
- POS day open/close.
- Static cashier/admin UI served at the hub root.
- Electron desktop shell via `pnpm --filter @gaurav-pos/hub-electron dev:desktop`.
- Floor/table setup APIs.
- Production-unit and menu setup APIs.
- Table list/bootstrap and active table order lookup.
- Order submit to a table.
- New, modified, partial-cancel, cancelled, and reprint KOT foundations.
- KDS view by production unit with `queued`, `preparing`, `ready`, and `served` status transitions.
- Production-unit routing to kitchen/bar printers.
- Print-job queue with list, retry, and retryable `pending`, `printing`, `printed`, `failed` states.
- Bill generation and cash settlement.
- Append-only `event_log` and `sync_outbox` for Convex sync.
- Convex HTTP sync bridge route at `/sync/push`; background push attempts every 60 seconds when `CONVEX_HTTP_URL` and `POS_SYNC_SECRET` are set.
- Fastify REST API plus WebSocket realtime endpoint.

The Android app currently implements:

- Expo/React Native shell.
- Manual hub URL setting.
- Hub health polling.
- Table list and menu list from hub bootstrap.
- Offline draft order storage in AsyncStorage.
- Hub-confirmed order/KOT submission when online.

The cloud admin currently implements:

- Next.js App Router shell.
- WorkOS AuthKit client session and Convex auth provider bridge.
- Google-only sign-in route expectation.
- Authenticated dashboard shell for restaurant sync/device/reporting surfaces.
- Convex schema for restaurants, devices, synced events, and daily reports.
- Convex HTTP event ingestion boundary protected by `POS_SYNC_SECRET`.

## Important Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:hub
pnpm --filter @gaurav-pos/hub-electron dev:desktop
pnpm --filter @gaurav-pos/mobile dev
pnpm dev:cloud
```

The hub defaults to `http://localhost:3737`. Android devices on the same LAN should use the Windows hub LAN IP, for example `http://192.168.1.20:3737`.

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

- Receipt/cashier printer destination: KOT printing routes through production units, but bill printing currently needs a real cashier/receipt printer configuration model.
- Exact Android release path: Expo shell exists; decide Expo dev client vs bare/native build before hardware testing.
- Electron UI framework: current hub UI is static HTML/JS served by Fastify inside Electron; migrate to Vite + React only if the UI complexity justifies it.
- Cloud admin framework: Next.js App Router + Convex + WorkOS AuthKit scaffold exists.
- Hardware printer protocol needs restaurant hardware testing before replacing the current minimal TCP ESC/POS adapter.
- Tax/service charge rules need real restaurant requirements before finalizing bill math.
- Device pairing and local role middleware are still pending; do not expose the hub on an untrusted network.
