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

- `admin`: settings, devices, menu, printers, POS day close, reports.
- `cashier`: bills, payments, reprints, table supervision.
- `waiter`: table order draft/submit.
- `kitchen`: KDS status updates.

## Why This Shape

Pure cloud auth would fail during outages. Pure local auth would make SaaS onboarding, owner access, staff management, and multi-restaurant reporting messy. This split gives one account system for the business while preserving offline service operations.

## Current Provider Scope

Only Google sign-in should be enabled in WorkOS AuthKit. Disable password, OTP/magic links, and other social providers in the WorkOS Dashboard.

## Current Implementation State

- Cloud admin uses WorkOS AuthKit in `apps/cloud-admin`.
- Convex auth config expects WorkOS JWTs in `convex/auth.config.ts`.
- Local hub REST endpoints and realtime WebSocket are protected by local device tokens.
- Hub pairing APIs can create one-time pairing codes, exchange them for long-lived local device tokens, list devices, and revoke paired devices.
- Development seeds `dev-admin-token`; production should set `HUB_ADMIN_TOKEN`.
- Convex event ingestion HTTP route requires `POS_SYNC_SECRET`.
- Cloud-to-hub role snapshots are still pending; current hub roles are stored locally.
