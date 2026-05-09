# Reuse Map

- `packages/shared/src/schemas.ts`: API command validation for hub operations.
- `packages/shared/src/types.ts`: shared role, order, KOT, print, billing, and event types.
- `apps/hub-electron/src/db/schema.ts`: SQLite migration source of truth.
- `apps/hub-electron/src/domain/order-service.ts`: table order, KOT lifecycle, billing, and event/outbox transaction rules.
- `apps/hub-electron/src/api/server.ts`: LAN REST/WebSocket API surface used by hub UI and Android clients.
- `apps/hub-electron/src/public/*`: current cashier/admin operational UI served by the hub.
- `apps/hub-electron/src/electron.ts`: desktop shell that starts the hub and opens the UI.
- `apps/hub-electron/src/printing/print-job-service.ts`: print retry state machine and adapter boundary.
- `apps/hub-electron/src/sync/convex-sync.ts`: SQLite outbox to Convex HTTP sync bridge.
- `apps/mobile/src/lib/hub-client.ts`: Android LAN API client.
- `apps/mobile/src/lib/draft-store.ts`: Android hub URL and draft persistence.
- `convex/http.ts`: cloud HTTP action for hub event ingestion.
- `convex/sync.ts`: idempotent event ingestion mutation.
- `.agent/pos-context.md`: read first for architecture decisions, current implementation state, auth shape, and open decisions.
- `.agent/next-steps.md`: execution roadmap for the next implementation phases.
- `docs/auth-architecture.md`: canonical auth split between WorkOS AuthKit + Convex cloud identity and hub-local offline sessions.
- `docs/workos-authkit-setup.md`: exact WorkOS AuthKit envs, Google-only dashboard setup, and local validation steps.
- `apps/cloud-admin/src/components/convex-client-provider.tsx`: WorkOS AuthKit to Convex token bridge for Next.js.
