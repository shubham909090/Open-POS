import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import {
  cancelOrderSchema,
  cancelOrderItemsSchema,
  createPairingCodeSchema,
  exchangePairingCodeSchema,
  managerPinUnlockSchema,
  moveOrderItemsSchema,
  moveTableSchema,
  reprintKotSchema,
  revokeDeviceSchema,
  submitOrderSchema,
  updateKotStatusSchema,
  updateOrderStateSchema,
  type UserRole
} from "@gaurav-pos/shared";
import { cloudCommandFailures } from "../db/drizzle-schema.js";
import type { LocalDeviceSession } from "../domain/auth-service.js";
import { DomainError } from "../domain/errors.js";
import { registerBillingRoutes } from "./billing-routes.js";
import { registerCatalogRoutes } from "./catalog-routes.js";
import { createIdempotencyHandler } from "./idempotency.js";
import { registerMaintenanceRoutes } from "./maintenance-routes.js";
import { detectLanIpv4Address, resolvePairingHubUrl } from "./pairing-url.js";
import { createPrintJobProcessor } from "./print-job-processing.js";
import { registerPrintRoutes } from "./print-routes.js";
import { realtimeEventForRole } from "./realtime-visibility.js";
import { registerReportRoutes } from "./report-routes.js";
import { createRouteAuth } from "./route-auth.js";
import type { HubServerInput } from "./route-context.js";
import { registerSettingsRoutes } from "./settings-routes.js";

const hubFaviconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#18181b"/><path fill="#fff" d="M17 17h30v7H17zM17 29h30v7H17zM17 41h20v7H17z"/><path fill="#0f766e" d="M42 41h5v7h-5z"/></svg>';

export { resolvePairingHubUrl, selectPairingLanAddress } from "./pairing-url.js";
export { isRealtimeEventVisibleForRole, realtimeEventForRole } from "./realtime-visibility.js";

export function createHubServer(input: HubServerInput) {
  const app = Fastify({ logger: true });
  const processCreatedPrintJobs = createPrintJobProcessor(input.printJobService);

  const dedupeInFlight = <T>(state: { promise: Promise<T> | null }, run: () => Promise<T>) => {
    if (state.promise) return state.promise;
    state.promise = run().finally(() => {
      state.promise = null;
    });
    return state.promise;
  };
  const syncPushState: { promise: Promise<{ pushed: number; skipped: boolean }> | null } = { promise: null };
  const syncPullState: { promise: Promise<{ applied: number; failed?: number; skipped?: boolean; cursor?: string }> | null } = { promise: null };

  app.register(websocket);
  app.get("/favicon.ico", async (_request, reply) => reply.type("image/svg+xml").send(hubFaviconSvg));
  const staticRoot = fileURLToPath(new URL("../../dist/public", import.meta.url));
  app.register(fastifyStatic, {
    root: staticRoot,
    index: "index.html"
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }
    reply.status(500).send({ error: error instanceof Error ? error.message : "Unexpected error" });
  });

  const { getToken, ...routeAuth } = createRouteAuth(input.authService);
  const { anyRole, adminOnly, captainOrAdmin, orderRole, orderMoveRole, kitchenRole, getSession } = routeAuth;
  const publicBootstrapForRole = (bootstrap: Record<string, unknown>, role: UserRole): Record<string, unknown> => {
    if (role === "admin" || role === "captain") return bootstrap;
    const { ticketTemplate: _ticketTemplate, printJobs: _printJobs, syncStatus: _syncStatus, ...safeBootstrap } = bootstrap;
    return safeBootstrap;
  };
  const currentLicenseState = () =>
    input.syncBridge?.getLicenseState() ?? { status: "missing", reason: "missing_license", message: "Cloud license service is not configured." };
  const cloudBackupOffMessage = "Cloud Backup is off. Enable it with Master PIN before using cloud backup.";
  const isLicenseRequired = () => input.licenseRequired === true || currentLicenseState().status !== "missing";
  const requireServiceLicense = async () => {
    if (!input.syncBridge || !isLicenseRequired()) return;
    const license = currentLicenseState();
    if (license.status === "missing" || license.status === "locked") {
      throw new DomainError(license.message, 402);
    }
  };
  const requireCloudBackupEnabled = () => {
    if (!input.orderService.isCloudBackupEnabled()) throw new DomainError(cloudBackupOffMessage, 403);
  };
  const withServiceLicense =
    (handler: typeof routeAuth.anyRole) =>
    async (request: Parameters<typeof handler>[0]) => {
      await handler(request);
      await requireServiceLicense();
    };
  const licensedAuth = {
    ...routeAuth,
    anyRole: withServiceLicense(routeAuth.anyRole),
    adminOnly: withServiceLicense(routeAuth.adminOnly),
    captainOrAdmin: withServiceLicense(routeAuth.captainOrAdmin),
    orderRole: withServiceLicense(routeAuth.orderRole),
    orderMoveRole: withServiceLicense(routeAuth.orderMoveRole),
    kitchenRole: withServiceLicense(routeAuth.kitchenRole)
  };
  const tableOrderForRole = (tableOrder: unknown, role: UserRole): unknown => {
    if (role === "admin" || role === "captain" || tableOrder === null || typeof tableOrder !== "object") return tableOrder;
    const order = tableOrder as Record<string, unknown>;
    return {
      order: order.order,
      items: order.items,
      bill: null
    };
  };
  const withIdempotency = createIdempotencyHandler(input.database);

  const pairingAttempts = new Map<string, { failedAttempts: number; windowStartedAt: number; lockedUntil: number }>();
  const pairingAttemptWindowMs = 5 * 60 * 1000;
  const pairingLockMs = 10 * 60 * 1000;
  const maxPairingFailures = 8;
  const assertPairingExchangeAllowed = (key: string): void => {
    const now = Date.now();
    const state = pairingAttempts.get(key);
    if (!state) return;
    if (state.lockedUntil > now) {
      throw new DomainError("Too many failed pairing attempts. Try again later.", 429);
    }
    if (now - state.windowStartedAt > pairingAttemptWindowMs) {
      pairingAttempts.delete(key);
    }
  };
  const recordPairingFailure = (key: string): void => {
    const now = Date.now();
    const current = pairingAttempts.get(key);
    const state =
      current && now - current.windowStartedAt <= pairingAttemptWindowMs
        ? current
        : { failedAttempts: 0, windowStartedAt: now, lockedUntil: 0 };
    state.failedAttempts += 1;
    if (state.failedAttempts >= maxPairingFailures) {
      state.lockedUntil = now + pairingLockMs;
    }
    pairingAttempts.set(key, state);
  };
  const recordPairingSuccess = (key: string): void => {
    pairingAttempts.delete(key);
  };

  app.get("/health", async () => ({ ok: true }));
  app.get("/admin/session/status", async () => ({ managerPinConfigured: input.orderService.isManagerPinConfigured() }));
  app.post("/admin/session/unlock", async (request) => {
    const body = managerPinUnlockSchema.parse(request.body);
    input.orderService.verifyManagerPinForSession(body.pin);
    const token = `hub_admin_${randomBytes(32).toString("base64url")}`;
    input.authService.createAdminSession(token, "Admin session");
    return { token, role: "admin" };
  });
  app.post("/admin/session/lock", { preHandler: adminOnly }, async (request) => {
    input.authService.revokeToken(getToken(request));
    return { locked: true };
  });
  app.post("/devices/pair/exchange", async (request) => {
    const attemptKey = request.ip || "unknown";
    assertPairingExchangeAllowed(attemptKey);
    try {
      const result = input.authService.exchangePairingCode(exchangePairingCodeSchema.parse(request.body));
      recordPairingSuccess(attemptKey);
      return result;
    } catch (error) {
      recordPairingFailure(attemptKey);
      throw error;
    }
  });
  app.get("/sync/bootstrap", { preHandler: anyRole }, async (request) => {
    const session = getSession(request);
    const bootstrap = input.orderService.bootstrap() as Record<string, unknown>;
    return {
      ...publicBootstrapForRole(bootstrap, session.role),
      setup: {
        printerOutputMode: input.orderService.getPrinterOutputMode(),
        managerPinConfigured: input.orderService.isManagerPinConfigured(),
        masterPinConfigured: input.orderService.isMasterPinConfigured(),
        cloudBackupEnabled: input.orderService.isCloudBackupEnabled(),
        hubConnection: input.orderService.getHubConnectionSettings(false),
        license: currentLicenseState()
      }
    };
  });
  app.get("/license/status", { preHandler: anyRole }, async () => currentLicenseState());
  app.post("/license/activate", { preHandler: adminOnly }, async (request) => {
    if (!input.syncBridge) throw new DomainError("Cloud sync is not available", 503);
    const body = request.body as { cloudUrl?: string; setupKey?: string; hubLabel?: string };
    if (!body.cloudUrl || !body.setupKey) throw new DomainError("Cloud URL and setup key are required", 400);
    return input.syncBridge.activateLicense({ cloudUrl: body.cloudUrl, setupKey: body.setupKey, hubLabel: body.hubLabel });
  });
  app.post("/license/check", { preHandler: adminOnly }, async () => {
    if (!input.syncBridge) throw new DomainError("Cloud sync is not available", 503);
    return input.syncBridge.checkLicenseOnline();
  });
  app.get("/cloud-backup/manifest", { preHandler: adminOnly }, async () => {
    requireCloudBackupEnabled();
    if (!input.syncBridge) return { manifests: [] };
    return input.syncBridge.fetchBackupManifest();
  });
  app.post("/cloud-backup/restore", { preHandler: adminOnly }, async (request) => {
    requireCloudBackupEnabled();
    if (!input.syncBridge) throw new DomainError("Cloud sync is not available", 503);
    const masterPin = String(request.headers["x-master-pin"] ?? "");
    input.orderService.verifyMasterPinForSession(masterPin);
    const body = request.body as { kind?: "order_history" | "menu_catalog" | "alcohol_stock" | "table_layout"; throughBusinessDate?: string };
    if (!body.kind || !["order_history", "menu_catalog", "alcohol_stock", "table_layout"].includes(body.kind)) {
      throw new DomainError("Valid restore kind is required", 400);
    }
    return input.syncBridge.restoreFromCloud({ kind: body.kind, throughBusinessDate: body.throughBusinessDate });
  });
  app.get("/sync/status", { preHandler: captainOrAdmin }, async () => input.orderService.getSyncStatus());
  app.post("/sync/push", { preHandler: adminOnly }, async () => {
    requireCloudBackupEnabled();
    return input.syncBridge ? dedupeInFlight(syncPushState, () => input.syncBridge!.pushPending()) : { pushed: 0, skipped: true };
  });
  app.post("/sync/pull", { preHandler: adminOnly }, async () => {
    requireCloudBackupEnabled();
    return input.syncBridge ? dedupeInFlight(syncPullState, () => input.syncBridge!.pullCloudSnapshot()) : { applied: 0, skipped: true };
  });
  app.post("/sync/requeue-failed", { preHandler: adminOnly }, async () => {
    requireCloudBackupEnabled();
    return input.syncBridge?.requeueFailedEvents() ?? { requeued: 0 };
  });
  app.delete<{ Params: { commandId: string } }>("/sync/cloud-command-failures/:commandId", { preHandler: adminOnly }, async ({ params }) => {
    const result = input.database.orm.delete(cloudCommandFailures).where(eq(cloudCommandFailures.commandId, params.commandId)).run();
    return { commandId: params.commandId, resolved: Number(result.changes ?? 0) > 0 };
  });
  registerCatalogRoutes({ app, input, auth: licensedAuth });
  app.get("/tables/:id/order", { preHandler: licensedAuth.orderRole }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    return tableOrderForRole(input.orderService.getTableOrder(params.id), session.role);
  });
  registerSettingsRoutes({ app, input, auth: routeAuth });
  app.get("/devices", { preHandler: adminOnly }, async () => input.authService.listDevices());
  app.post("/devices/pairing-codes", { preHandler: adminOnly }, async (request) => {
    const body = createPairingCodeSchema.parse(request.body);
    if (!body.managerApproval) throw new DomainError("Manager PIN is required to create a device pairing QR", 403);
    input.orderService.verifyManagerPinForSession(body.managerApproval.pin);
    const pairing = input.authService.createPairingCode(body);
    const hubUrl = resolvePairingHubUrl({
      savedPublicUrl: input.orderService.getHubConnectionRuntimeSettings().hubPublicUrl,
      configuredPublicUrl: input.publicUrl,
      requestProtocol: request.protocol || "http",
      requestHost: request.headers.host ?? "localhost:3737",
      fallbackLanAddress: detectLanIpv4Address()
    });
    const payload = {
      kind: "gaurav-pos-pairing",
      version: 1,
      hubUrl,
      code: pairing.code,
      deviceName: body.deviceName,
      role: body.role,
      expiresAt: pairing.expiresAt
    };
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240
    });
    return { ...pairing, pairingPayload: payload, pairingPayloadText: JSON.stringify(payload), qrDataUrl };
  });
  app.post("/devices/:id/revoke", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return input.authService.revokeDevice(params.id, revokeDeviceSchema.parse(request.body));
  });
  app.get("/devices/me", { preHandler: anyRole }, async (request) => getSession(request));
  app.get("/kds/:productionUnitId", { preHandler: licensedAuth.kitchenRole }, async (request) => {
    const params = request.params as { productionUnitId: string };
    return input.orderService.listKds(params.productionUnitId);
  });
  app.patch("/kot/:id/status", { preHandler: licensedAuth.kitchenRole }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateKotStatus(params.id, updateKotStatusSchema.parse(request.body));
    input.eventBus.publish({ type: "kot.status_changed", result });
    return result;
  });
  app.get("/orders/:id", { preHandler: licensedAuth.orderRole }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    return tableOrderForRole(input.orderService.getOrder(params.id), session.role);
  });
  app.get("/notifications/ready", { preHandler: licensedAuth.orderRole }, async (request) => input.orderService.listReadyNotifications(getSession(request)));

  app.after(() => {
    app.get("/realtime", { websocket: true }, (socket, request) => {
      let session: LocalDeviceSession;
      try {
        session = input.authService.authenticate(getToken(request));
      } catch {
        socket.close();
        return;
      }
      const unsubscribe = input.eventBus.subscribe((event) => {
        const visibleEvent = realtimeEventForRole(event, session.role);
        if (!visibleEvent) return;
        socket.send(JSON.stringify(visibleEvent));
      });
      socket.on("close", unsubscribe);
    });
  });

  registerReportRoutes({ app, input, auth: licensedAuth });

  app.post("/orders/submit", { preHandler: licensedAuth.orderRole }, async (request) => {
    const { result, replayed } = await withIdempotency(request, "orders.submit", () =>
      input.orderService.submitOrder(submitOrderSchema.parse(request.body), getSession(request))
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs(result.printJobIds);
    if (!replayed) input.eventBus.publish({ type: "order.submitted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/tables/move", { preHandler: licensedAuth.orderMoveRole }, async (request) => {
    const result = input.orderService.moveTable(moveTableSchema.parse(request.body), getSession(request));
    const processed = await processCreatedPrintJobs(result.printJobIds);
    input.eventBus.publish({ type: "table.shifted", result: { ...result, processed } });
    return { ...result, processed };
  });

  app.post("/orders/items/move", { preHandler: licensedAuth.orderMoveRole }, async (request) => {
    const result = input.orderService.moveOrderItems(moveOrderItemsSchema.parse(request.body), getSession(request));
    const processed = await processCreatedPrintJobs(result.printJobIds);
    input.eventBus.publish({ type: "order_items.shifted", result: { ...result, processed } });
    return { ...result, processed };
  });

  app.post("/orders/:id/cancel", { preHandler: licensedAuth.captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    const result = input.orderService.cancelOrder(
      params.id,
      cancelOrderSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
    );
    const processed = await processCreatedPrintJobs(result.printJobIds);
    input.eventBus.publish({ type: "order.cancelled", result: { ...result, processed } });
    return { ...result, processed };
  });

  app.post("/orders/:id/items/cancel", { preHandler: licensedAuth.captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    const result = input.orderService.cancelOrderItems(
      params.id,
      cancelOrderItemsSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
    );
    const processed = await processCreatedPrintJobs(result.printJobIds);
    input.eventBus.publish({ type: "order_items.cancelled", result: { ...result, processed } });
    return { ...result, processed };
  });

  app.post("/orders/:id/state", { preHandler: licensedAuth.captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const { result, replayed } = await withIdempotency(request, `orders.state.${params.id}`, () =>
      input.orderService.updateOrderState(params.id, updateOrderStateSchema.parse(request.body))
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs(result.printJobIds);
    if (!replayed) {
      input.eventBus.publish({
        type: "order_state.updated",
        result: { ...result, kdsChanged: result.kotIds.length > 0, processed }
      });
    }
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/kot/:id/reprint", { preHandler: licensedAuth.captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `kot.reprint.${params.id}`, () =>
      input.orderService.reprintKot(
        params.id,
        reprintKotSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
      )
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "kot.reprinted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  registerBillingRoutes({
    app,
    input,
    auth: licensedAuth,
    withIdempotency,
    processCreatedPrintJobs
  });

  registerPrintRoutes({ app, input, auth: licensedAuth });

  registerMaintenanceRoutes({ app, input, auth: routeAuth });

  return app;
}
