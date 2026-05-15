# Auth Architecture

The POS needs auth that works for a SaaS product but does not break restaurant service during internet outages.

## Unified Auth Layer

Use **WorkOS AuthKit + Convex** as the unified cloud identity layer.

- AuthKit handles hosted Google sign-in, sessions, and account security.
- Convex stores auth-backed user/account state and all tenant data.
- Cloud functions must derive identity from Convex auth context, never from client-provided user IDs.
- Tenant isolation is based on authenticated restaurant membership.

## Local Hub Sessions

The Windows hub must continue operating offline, so it needs local service sessions derived from cloud enrollment.

- A restaurant owner/admin signs into cloud during setup.
- The hub is registered as a device/installation for a restaurant.
- Staff users and roles sync down to the hub.
- Android devices pair with the hub using QR/manual code.
- The hub issues local device tokens for LAN API calls.
- During internet outage, the hub enforces the last synced role snapshot.
- When internet returns, the hub refreshes role/device revocation data from Convex.

## Roles

There are two role layers.

Cloud portal roles:

| Role | Scope |
| --- | --- |
| `owner` | Owns the restaurant account, creates hub connections, manages staff, sees reports. |
| `admin` | Manages staff/setup/support commands and sees reports, but cannot create a new hub connection. |
| `reporting` | Reads cloud reports only. No setup, staff, or hub connection authority. |

Local hub/mobile device roles:

| Capability | admin | captain | waiter | kitchen |
| --- | --- | --- | --- | --- |
| Hub setup, device pairing, printers, templates, manager PIN, backups, sync tools | yes | no | no | no |
| View full order/bill/payment/KOT data | yes | yes | no | no |
| Submit table orders | yes | yes | yes | no |
| Move table/items | yes | any running table/items | no | no |
| Billing, settlement, NC, reprint, revisions | yes | yes | no | no |
| Reports and alcohol stock reports | yes | yes | no | no |
| KDS ticket screen and KOT/BOT status updates | yes | no | no | yes |
| Ready notifications | yes | yes | yes | no |

Sensitive actions still require Manager PIN even for `admin`/`captain`: cancel/remove order, reprint/regenerate bill, revise bill after print, edit running-table item price, NC bill, and alcohol stock adjustment.

## Why This Shape

Pure cloud auth would fail during outages. Pure local auth would make SaaS onboarding, owner access, staff management, and multi-restaurant reporting messy. This split gives one account system for the business while preserving offline service operations.

## Current Provider Scope

Only Google sign-in should be enabled in WorkOS AuthKit. Disable password, OTP/magic links, and other social providers in the WorkOS Dashboard.

## Current Implementation State

- Cloud admin uses WorkOS AuthKit in `apps/cloud-admin`.
- Convex auth config expects WorkOS JWTs in `convex/auth.config.ts`.
- Local hub REST endpoints and realtime WebSocket are protected by local device tokens.
- Hub pairing APIs can create one-time pairing codes, exchange them for long-lived local device tokens, list devices, and revoke paired devices.
- Development may seed `dev-admin-token`; restaurant installs create a Manager PIN and unlock setup through the hub UI instead of typing `HUB_ADMIN_TOKEN`.
- Convex event ingestion requires the hub to send its installation ID and matching sync secret. The secret is stored on the Convex `installations` record and in local hub SQLite settings, not as a Convex deployment env var.
- Cloud-to-hub device update/revoke commands exist; current local authority is enforced from the paired hub device token and role.
