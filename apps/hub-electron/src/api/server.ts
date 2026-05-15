import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { and, eq } from "drizzle-orm";
import Fastify from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import {
  cancelOrderSchema,
  adjustAlcoholStockSchema,
  createAlcoholItemSchema,
  createBackupSchema,
  createFloorSchema,
  fullResetSchema,
  createMenuItemSchema,
  createPairingCodeSchema,
  createProductionUnitSchema,
  createSaleGroupSchema,
  createTableSchema,
  exchangePairingCodeSchema,
  hubConnectionSettingsSchema,
  managerPinSchema,
  managerPinUnlockSchema,
  markNcBillSchema,
  moveOrderItemsSchema,
  moveTableSchema,
  reprintKotSchema,
  revokeDeviceSchema,
  reviseBillSchema,
  retryPrintJobSchema,
  settleBillSchema,
  printLayoutSettingsSchema,
  scheduleRestoreSchema,
  submitOrderSchema,
  ticketTemplateSchema,
  updateAlcoholItemSchema,
  updateFloorSchema,
  updateKotStatusSchema,
  updateMenuItemSchema,
  updatePrinterOutputModeSchema,
  updateProductionUnitSchema,
  updateReceiptPrinterSchema,
  updateSaleGroupSchema,
  updateTableSchema,
  type UserRole
} from "@gaurav-pos/shared";
import type { HubDatabase } from "../db/database.js";
import type { BackupService } from "../db/backup-service.js";
import { cloudCommandFailures, idempotencyRecords } from "../db/drizzle-schema.js";
import { AuthService } from "../domain/auth-service.js";
import type { LocalDeviceSession } from "../domain/auth-service.js";
import { DomainError } from "../domain/errors.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import type { PrintJobService } from "../printing/print-job-service.js";
import { listSystemPrinters } from "../printing/printer-discovery.js";
import type { ConvexSyncBridge } from "../sync/convex-sync.js";

export function isRealtimeEventVisibleForRole(event: unknown, role: UserRole): boolean {
  if (role === "admin" || role === "captain") return true;
  const type = typeof event === "object" && event !== null && "type" in event ? String((event as { type?: unknown }).type ?? "") : "";
  if (role === "kitchen") return type.startsWith("kot.");
  if (role === "waiter") return ["order.submitted", "table.shifted", "order_items.shifted", "kot.status_changed"].includes(type);
  return false;
}

export function createHubServer(input: {
  database: HubDatabase;
  backupService: BackupService;
  authService: AuthService;
  orderService: OrderService;
  printJobService: PrintJobService;
  syncBridge?: ConvexSyncBridge;
  eventBus: EventBus<unknown>;
  publicUrl?: string;
  requestRestart?: () => void;
}) {
  const app = Fastify({ logger: true });

  app.register(websocket);
  const staticRootCandidates = [
    fileURLToPath(new URL("../../dist/public", import.meta.url)),
    fileURLToPath(new URL("../public", import.meta.url))
  ];
  app.register(fastifyStatic, {
    root: staticRootCandidates.find((candidate) => existsSync(candidate)) ?? staticRootCandidates[0],
    index: "index.html"
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }
    reply.status(500).send({ error: error instanceof Error ? error.message : "Unexpected error" });
  });

  const getToken = (request: {
    headers: Record<string, string | string[] | undefined>;
    query?: unknown;
  }): string | undefined => {
    const authorization = request.headers.authorization;
    const headerToken = request.headers["x-device-token"];
    const protocolHeader = request.headers["sec-websocket-protocol"];
    const protocolToken =
      typeof protocolHeader === "string"
        ? protocolHeader
            .split(",")
            .map((value) => value.trim())
            .find((value) => value.startsWith("pos-token."))
            ?.slice("pos-token.".length)
        : undefined;
    const query = request.query as { token?: string } | undefined;
    return typeof headerToken === "string"
      ? headerToken
      : typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : protocolToken ?? query?.token;
  };

  const requireRoles = (roles: UserRole[]) => async (request: { headers: Record<string, string | string[] | undefined> }) => {
    const token = getToken(request);
    const session = input.authService.authenticate(token);
    if (!roles.includes(session.role)) throw new DomainError("Device role is not allowed for this action", 403);
  };
  const getSession = (request: { headers: Record<string, string | string[] | undefined> }): LocalDeviceSession =>
    input.authService.authenticate(getToken(request));

  const anyRole = requireRoles(["admin", "captain", "waiter", "kitchen"]);
  const adminOnly = requireRoles(["admin"]);
  const captainOrAdmin = requireRoles(["admin", "captain"]);
  const orderRole = requireRoles(["admin", "captain", "waiter"]);
  const orderMoveRole = requireRoles(["admin", "captain"]);
  const kitchenRole = requireRoles(["admin", "kitchen"]);
  const requireManagerPinHeader = (request: { headers: Record<string, string | string[] | undefined> }): void => {
    const rawPin = request.headers["x-manager-pin"];
    const pin = typeof rawPin === "string" ? rawPin : "";
    input.orderService.verifyManagerPinForSession(managerPinUnlockSchema.parse({ pin }).pin);
  };
  const isLocalRequest = (request: { ip?: string; socket?: { remoteAddress?: string } }): boolean => {
    const address = request.ip || request.socket?.remoteAddress || "";
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address === "localhost";
  };
  const publicBootstrapForRole = (bootstrap: Record<string, unknown>, role: UserRole): Record<string, unknown> => {
    if (role === "admin" || role === "captain") return bootstrap;
    const { ticketTemplate: _ticketTemplate, printJobs: _printJobs, syncStatus: _syncStatus, ...safeBootstrap } = bootstrap;
    return safeBootstrap;
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
  const withIdempotency = async <T>(
    request: { body?: unknown; headers: Record<string, string | string[] | undefined> },
    route: string,
    handler: () => T
  ): Promise<{ result: T; replayed: boolean }> => {
    const rawKey = request.headers["idempotency-key"];
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!key) return { result: handler(), replayed: false };
    const requestHash = createHash("sha256").update(JSON.stringify(request.body ?? null)).digest("hex");

    const existing = input.database.orm
      .select({
        requestHash: idempotencyRecords.requestHash,
        responseJson: idempotencyRecords.responseJson,
        status: idempotencyRecords.status
      })
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
      .get();
    if (existing && existing.requestHash !== requestHash) {
      throw new DomainError("Idempotency key was already used with a different request body", 409);
    }
    if (existing?.status === "completed") return { result: JSON.parse(existing.responseJson) as T, replayed: true };
    if (existing?.status === "in_progress") throw new DomainError("Request is already in progress. Retry shortly.", 409);

    const now = new Date().toISOString();
    if (existing?.status === "failed") {
      input.database.orm
        .update(idempotencyRecords)
        .set({ status: "in_progress", responseJson: "", updatedAt: now })
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
        .run();
    } else {
      try {
        input.database.orm
          .insert(idempotencyRecords)
          .values({ key, route, requestHash, status: "in_progress", responseJson: "", createdAt: now, updatedAt: now })
          .run();
      } catch {
        throw new DomainError("Request is already in progress. Retry shortly.", 409);
      }
    }

    try {
      const result = handler();
      input.database.orm
        .update(idempotencyRecords)
        .set({ status: "completed", responseJson: JSON.stringify(result), updatedAt: new Date().toISOString() })
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
        .run();
      return { result, replayed: false };
    } catch (error) {
      input.database.orm
        .update(idempotencyRecords)
        .set({ status: "failed", updatedAt: new Date().toISOString() })
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
        .run();
      throw error;
    }
  };

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
    input.authService.seedAdminDevice(token);
    return { token, role: "admin" };
  });
  app.post("/admin/session/lock", { preHandler: adminOnly }, async () => {
    input.authService.lockAdminDevice();
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
        hubConnection: input.orderService.getHubConnectionSettings(false)
      }
    };
  });
  app.get("/sync/status", { preHandler: captainOrAdmin }, async () => input.orderService.getSyncStatus());
  app.post("/sync/push", { preHandler: adminOnly }, async () => input.syncBridge?.pushPending() ?? { pushed: 0, skipped: true });
  app.post("/sync/pull", { preHandler: adminOnly }, async () => input.syncBridge?.pullCloudSnapshot() ?? { applied: 0, skipped: true });
  app.post("/sync/requeue-failed", { preHandler: adminOnly }, async () => input.syncBridge?.requeueFailedEvents() ?? { requeued: 0 });
  app.delete<{ Params: { commandId: string } }>("/sync/cloud-command-failures/:commandId", { preHandler: adminOnly }, async ({ params }) => {
    const result = input.database.orm.delete(cloudCommandFailures).where(eq(cloudCommandFailures.commandId, params.commandId)).run();
    return { commandId: params.commandId, resolved: Number(result.changes ?? 0) > 0 };
  });
  app.get("/floors", { preHandler: anyRole }, async () => input.orderService.listFloors());
  app.post("/floors", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createFloor(createFloorSchema.parse(request.body));
    input.eventBus.publish({ type: "floor.created", result });
    return result;
  });
  app.patch("/floors/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateFloor(params.id, updateFloorSchema.parse(request.body));
    input.eventBus.publish({ type: "floor.updated", result });
    return result;
  });
  app.delete("/floors/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeFloor(params.id);
    input.eventBus.publish({ type: "floor.removed", result });
    return result;
  });
  app.get("/tables", { preHandler: anyRole }, async () => input.orderService.listTables());
  app.post("/tables", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createTable(createTableSchema.parse(request.body));
    input.eventBus.publish({ type: "table.created", result });
    return result;
  });
  app.patch("/tables/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateTable(params.id, updateTableSchema.parse(request.body));
    input.eventBus.publish({ type: "table.updated", result });
    return result;
  });
  app.delete("/tables/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeTable(params.id);
    input.eventBus.publish({ type: "table.removed", result });
    return result;
  });
  app.get("/tables/:id/order", { preHandler: orderRole }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    return tableOrderForRole(input.orderService.getTableOrder(params.id), session.role);
  });
  app.get("/production-units", { preHandler: anyRole }, async () => input.orderService.listProductionUnits());
  app.get("/sale-groups", { preHandler: anyRole }, async () => input.orderService.listSaleGroups(true));
  app.post("/sale-groups", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createSaleGroup(createSaleGroupSchema.parse(request.body));
    input.eventBus.publish({ type: "sale_group.created", result });
    return result;
  });
  app.patch("/sale-groups/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateSaleGroup(params.id, updateSaleGroupSchema.parse(request.body));
    input.eventBus.publish({ type: "sale_group.updated", result });
    return result;
  });
  app.post("/production-units", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createProductionUnit(createProductionUnitSchema.parse(request.body));
    input.eventBus.publish({ type: "production_unit.created", result });
    return result;
  });
  app.patch("/production-units/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateProductionUnit(params.id, updateProductionUnitSchema.parse(request.body));
    input.eventBus.publish({ type: "production_unit.updated", result });
    return result;
  });
  app.delete("/production-units/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeProductionUnit(params.id);
    input.eventBus.publish({ type: "production_unit.removed", result });
    return result;
  });
  app.get("/menu-items", { preHandler: anyRole }, async (request) => {
    const query = request.query as { includeInactive?: string };
    return input.orderService.listMenuItems(query.includeInactive === "1" || query.includeInactive === "true");
  });
  app.post("/menu-items", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createMenuItem(createMenuItemSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.created", result });
    return result;
  });
  app.patch("/menu-items/:id/active", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const body = request.body as { active?: boolean };
    const result = input.orderService.setMenuItemActive(params.id, Boolean(body.active));
    input.eventBus.publish({ type: "menu_item.active_changed", result });
    return result;
  });
  app.delete("/menu-items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.removeMenuItem(params.id);
    input.eventBus.publish({ type: "menu_item.removed", result });
    return result;
  });
  app.patch("/menu-items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateMenuItem(params.id, updateMenuItemSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.updated", result });
    return result;
  });
  app.get("/alcohol", { preHandler: captainOrAdmin }, async () => input.orderService.listAlcoholCatalog());
  app.get("/alcohol/storage", { preHandler: captainOrAdmin }, async () => input.orderService.listAlcoholStorage());
  app.post("/alcohol/items", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createAlcoholItem(createAlcoholItemSchema.parse(request.body));
    input.eventBus.publish({ type: "alcohol_item.created", result });
    return result;
  });
  app.patch("/alcohol/items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateAlcoholItem(params.id, updateAlcoholItemSchema.parse(request.body));
    input.eventBus.publish({ type: "alcohol_item.updated", result });
    return result;
  });
  app.post("/alcohol/stock/:id/adjust", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.adjustAlcoholStock(params.id, adjustAlcoholStockSchema.parse(request.body));
    input.eventBus.publish({ type: "alcohol_stock.adjusted", result });
    return result;
  });
  app.get("/settings/receipt-printer", { preHandler: captainOrAdmin }, async () => input.orderService.getReceiptPrinter());
  app.get("/settings/printer-mode", { preHandler: adminOnly }, async () => ({ mode: input.orderService.getPrinterOutputMode() }));
  app.put("/settings/printer-mode", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updatePrinterOutputMode(updatePrinterOutputModeSchema.parse(request.body).mode);
    input.eventBus.publish({ type: "printer_output_mode.updated", result });
    return result;
  });
  app.get("/system-printers", { preHandler: adminOnly }, async () => listSystemPrinters());
  app.put("/settings/receipt-printer", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateReceiptPrinter(updateReceiptPrinterSchema.parse(request.body));
    input.eventBus.publish({ type: "receipt_printer.updated", result });
    return result;
  });
  app.put("/settings/manager-pin", async (request) => {
    if (input.orderService.isManagerPinConfigured()) await adminOnly(request);
    else if (!isLocalRequest(request)) throw new DomainError("Create the first Manager PIN from the hub PC.", 403);
    const result = input.orderService.setManagerPin(managerPinSchema.parse(request.body));
    input.eventBus.publish({ type: "manager_pin.updated", result });
    return result;
  });
  app.get("/settings/hub-connection", { preHandler: adminOnly }, async (request) => {
    const query = request.query as { reveal?: string };
    const reveal = query.reveal === "1" || query.reveal === "true";
    if (reveal) requireManagerPinHeader(request);
    return input.orderService.getHubConnectionSettings(reveal);
  });
  app.put("/settings/hub-connection", { preHandler: adminOnly }, async (request) => {
    requireManagerPinHeader(request);
    const result = input.orderService.updateHubConnectionSettings(hubConnectionSettingsSchema.parse(request.body));
    input.eventBus.publish({ type: "hub_connection.updated", result });
    return result;
  });
  app.post("/settings/hub-connection/test", { preHandler: adminOnly }, async (request) => {
    requireManagerPinHeader(request);
    const settings = input.orderService.getHubConnectionRuntimeSettings();
    if (!settings.cloudUrl || !settings.installationId || !settings.syncSecret) {
      return { status: "missing", message: "Cloud connection details are incomplete." };
    }
    try {
      const response = await fetch(`${settings.cloudUrl}/pos/ingest-events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pos-sync-secret": settings.syncSecret,
          "x-pos-installation-secret": settings.syncSecret,
          "x-pos-installation-id": settings.installationId
        },
        body: JSON.stringify({ events: [] })
      });
      if (response.status === 401 || response.status === 403) return { status: "unauthorized", message: "Cloud rejected these connection details." };
      if (!response.ok) return { status: "server_error", message: `Cloud returned HTTP ${response.status}.` };
      return { status: "connected", message: "Cloud connection works." };
    } catch (error) {
      return { status: "server_error", message: error instanceof Error ? error.message : "Cloud connection test failed." };
    }
  });
  app.get("/settings/ticket-template", { preHandler: captainOrAdmin }, async () => input.orderService.getTicketTemplate());
  app.put("/settings/ticket-template", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateTicketTemplate(ticketTemplateSchema.parse(request.body));
    input.eventBus.publish({ type: "ticket_template.updated", result });
    return result;
  });
  app.get("/print-layouts", { preHandler: captainOrAdmin }, async () => input.orderService.getPrintLayouts());
  app.put("/print-layouts/:scope", { preHandler: adminOnly }, async (request) => {
    requireManagerPinHeader(request);
    const params = request.params as { scope: string };
    const result = input.orderService.updatePrintLayout(printLayoutSettingsSchema.parse({ ...(request.body as Record<string, unknown>), scope: params.scope }));
    input.eventBus.publish({ type: "print_layout.updated", result });
    return result;
  });
  app.get("/devices", { preHandler: adminOnly }, async () => input.authService.listDevices());
  app.post("/devices/pairing-codes", { preHandler: adminOnly }, async (request) => {
    const body = createPairingCodeSchema.parse(request.body);
    if (!body.managerApproval) throw new DomainError("Manager PIN is required to create a device pairing QR", 403);
    input.orderService.verifyManagerPinForSession(body.managerApproval.pin);
    const pairing = input.authService.createPairingCode(body);
    const host = request.headers.host ?? "localhost:3737";
    const protocol = request.protocol || "http";
    const hubUrl = input.publicUrl ?? `${protocol}://${host}`;
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
  app.get("/kds/:productionUnitId", { preHandler: kitchenRole }, async (request) => {
    const params = request.params as { productionUnitId: string };
    return input.orderService.listKds(params.productionUnitId);
  });
  app.patch("/kot/:id/status", { preHandler: kitchenRole }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateKotStatus(params.id, updateKotStatusSchema.parse(request.body));
    input.eventBus.publish({ type: "kot.status_changed", result });
    return result;
  });
  app.get("/orders/:id", { preHandler: orderRole }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    return tableOrderForRole(input.orderService.getOrder(params.id), session.role);
  });
  app.get("/notifications/ready", { preHandler: orderRole }, async (request) => input.orderService.listReadyNotifications(getSession(request)));

  app.get("/realtime", { websocket: true }, (socket, request) => {
    let session: LocalDeviceSession;
    try {
      session = input.authService.authenticate(getToken(request));
    } catch {
      socket.close();
      return;
    }
    const unsubscribe = input.eventBus.subscribe((event) => {
      if (!isRealtimeEventVisibleForRole(event, session.role)) return;
      socket.send(JSON.stringify(event));
    });
    socket.on("close", unsubscribe);
  });

  app.get("/business-day/current-summary", { preHandler: captainOrAdmin }, async () => input.orderService.getCurrentBusinessDaySummary());
  app.get("/reports/daily", { preHandler: captainOrAdmin }, async () => {
    const result = input.orderService.listDailyReports();
    void input.syncBridge?.pushPending().catch((error) => app.log.warn(error, "Daily report sync will retry later"));
    return result;
  });
  app.get("/reports/daily/:posDayId", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { posDayId: string };
    return input.orderService.getDailyReport(params.posDayId);
  });
  app.get("/reports/alcohol-stock-movements", { preHandler: captainOrAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listAlcoholStockMovements(Number(query.limit ?? 100));
  });

  app.post("/orders/submit", { preHandler: orderRole }, async (request) => {
    const { result, replayed } = await withIdempotency(request, "orders.submit", () =>
      input.orderService.submitOrder(submitOrderSchema.parse(request.body), getSession(request))
    );
    if (!replayed) input.eventBus.publish({ type: "order.submitted", result });
    return result;
  });

  app.post("/tables/move", { preHandler: orderMoveRole }, async (request) => {
    const result = input.orderService.moveTable(moveTableSchema.parse(request.body), getSession(request));
    input.eventBus.publish({ type: "table.shifted", result });
    return result;
  });

  app.post("/orders/items/move", { preHandler: orderMoveRole }, async (request) => {
    const result = input.orderService.moveOrderItems(moveOrderItemsSchema.parse(request.body), getSession(request));
    input.eventBus.publish({ type: "order_items.shifted", result });
    return result;
  });

  app.post("/orders/:id/cancel", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    const result = input.orderService.cancelOrder(
      params.id,
      cancelOrderSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
    );
    input.eventBus.publish({ type: "order.cancelled", result });
    return result;
  });

  app.post("/kot/:id/reprint", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `kot.reprint.${params.id}`, () =>
      input.orderService.reprintKot(
        params.id,
        reprintKotSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
      )
    );
    if (!replayed) input.eventBus.publish({ type: "kot.reprinted", result });
    return result;
  });

  app.post("/bills/:billId/reprint", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.reprint.${params.billId}`, () =>
      input.orderService.reprintBill(
        params.billId,
        reprintKotSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
      )
    );
    if (!replayed) input.eventBus.publish({ type: "bill.reprinted", result });
    return result;
  });

  app.post("/bills/:billId/print", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.print.${params.billId}`, () =>
      input.orderService.printBill(params.billId, session.name)
    );
    if (!replayed) input.eventBus.publish({ type: "bill.printed", result });
    return result;
  });

  app.post("/bills/:billId/revise", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.revise.${params.billId}`, () =>
      input.orderService.reviseBill(params.billId, reviseBillSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "bill.revised", result });
    return result;
  });

  app.post("/bills/:billId/nc", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.nc.${params.billId}`, () =>
      input.orderService.markBillNc(params.billId, markNcBillSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "bill.nc_marked", result });
    return result;
  });

  app.post("/bills/:orderId/generate", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { orderId: string };
    const { result, replayed } = await withIdempotency(request, `bills.generate.${params.orderId}`, () =>
      input.orderService.generateBill(params.orderId)
    );
    if (!replayed) input.eventBus.publish({ type: "bill.generated", result });
    return result;
  });

  app.post("/bills/:billId/settle", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.settle.${params.billId}`, () =>
      input.orderService.settleBill(
        params.billId,
        settleBillSchema.parse({ ...(request.body as Record<string, unknown>), receivedBy: session.name })
      )
    );
    if (!replayed) input.eventBus.publish({ type: "bill.settled", result });
    return result;
  });

  app.post("/print-jobs/process", { preHandler: captainOrAdmin }, async () => input.printJobService.processPending());
  app.post("/print-jobs/test-bill", { preHandler: captainOrAdmin }, async (request) => {
    const session = getSession(request);
    const result = input.orderService.enqueueTestBillPrint(session.name);
    const processed = await input.printJobService.processOne(result.printJobId);
    input.eventBus.publish({ type: "print_job.test_bill_queued", result });
    return { ...result, processed };
  });
  app.post("/print-jobs/test-kot", { preHandler: captainOrAdmin }, async (request) => {
    const session = getSession(request);
    const result = input.orderService.enqueueTestKotPrint(session.name);
    const processed = await input.printJobService.processOne(result.printJobId);
    input.eventBus.publish({ type: "print_job.test_kot_queued", result });
    return { ...result, processed };
  });
  app.get("/print-jobs", { preHandler: captainOrAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listPrintJobs(Number(query.limit ?? 50));
  });
  app.post("/print-jobs/:id/retry", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.retryPrintJob(params.id, retryPrintJobSchema.parse(request.body));
    input.eventBus.publish({ type: "print_job.retry_requested", result });
    return result;
  });

  app.get("/backups", { preHandler: adminOnly }, async () => input.backupService.listBackups());
  app.post("/backups", { preHandler: adminOnly }, async (request) => {
    const body = createBackupSchema.parse(request.body ?? {});
    return input.backupService.createBackup(body.label);
  });
  app.post("/backups/restore", { preHandler: adminOnly }, async (request) => {
    const body = scheduleRestoreSchema.parse(request.body);
    return input.backupService.scheduleRestore(body.fileName);
  });
  app.post("/system/full-reset", { preHandler: adminOnly }, async (request) => {
    const body = fullResetSchema.parse(request.body);
    input.orderService.verifyManagerPinForSession(body.managerApproval.pin);
    const result = input.backupService.scheduleFullReset(body.includeBackups);
    setTimeout(() => {
      if (input.requestRestart) input.requestRestart();
    }, 250).unref();
    return result;
  });

  return app;
}
