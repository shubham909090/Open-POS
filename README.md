# Gaurav POS

Offline-first restaurant POS monorepo for a Windows hub, Android order-taking devices, LAN kitchen printers, and Convex cloud sync.

## Architecture

- `apps/hub-electron`: local Windows hub runtime. It owns SQLite, REST/WebSocket APIs, KOT generation, billing, print jobs, and cloud sync outbox.
- `apps/mobile`: React Native Android client shell for waiters and captains.
- `apps/cloud-admin`: Next.js cloud/admin shell for reporting and SaaS management.
- `packages/shared`: shared TypeScript types, Zod schemas, money helpers, and event contracts.
- `convex`: Convex cloud schema/functions for synced events, device enrollment, and reporting data.

The live restaurant flow does not depend on internet. Android clients submit final orders to the local hub over LAN. Convex receives durable local events whenever the internet is available.

## First Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev:hub
pnpm --filter @gaurav-pos/hub-electron dev:desktop
pnpm --filter @gaurav-pos/mobile dev
pnpm dev:cloud
```

The hub API and hub UI default to `http://localhost:3737`. Use the hub machine LAN IP from Android devices.

Cloud auth envs are intentionally not committed. See [docs/workos-authkit-setup.md](docs/workos-authkit-setup.md) for WorkOS Google-only setup and Convex sync envs.

## Restaurant Handoff

For sending installable apps to a restaurant PC and Android waiter tablets, see [docs/packaging/restaurant-handoff.md](docs/packaging/restaurant-handoff.md).

## Reference Intake

Reference repos are kept outside this product in `/Users/shubhamtemak/Documents/ExampleRepos`. See [docs/reference-intake.md](docs/reference-intake.md) for the patterns adopted from URY, MySagra, Olgax, and node-escpos.
