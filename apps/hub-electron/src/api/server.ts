import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { and, eq } from "drizzle-orm";
import Fastify from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import {
  adjustAlcoholStockSchema,
  billPrintDestinationSchema,
  cancelOrderSchema,
  cancelOrderItemsSchema,
  bulkDeleteAlcoholItemsSchema,
  bulkDeleteMenuItemsSchema,
  createAlcoholItemSchema,
  createBackupSchema,
  createFloorSchema,
  createMenuItemSchema,
  createPairingCodeSchema,
  createProductionUnitSchema,
  createSaleGroupSchema,
  createTableSchema,
  exchangePairingCodeSchema,
  fullResetSchema,
  generateBillSchema,
  historyEditBillSchema,
  hubConnectionSettingsSchema,
  importAlcoholCsvSchema,
  importCsvSchema,
  managerPinSchema,
  managerPinUnlockSchema,
  markNcBillSchema,
  menuItemDeleteApprovalSchema,
  moveOrderItemsSchema,
  moveTableSchema,
  printLayoutSettingsSchema,
  reprintBillSchema,
  reprintKotSchema,
  retryPrintJobSchema,
  reportRangeQuerySchema,
  revokeDeviceSchema,
  reviseBillSchema,
  scheduleRestoreSchema,
  setMasterPinSchema,
  settleBillSchema,
  submitOrderSchema,
  ticketTemplateSchema,
  updateAlcoholItemSchema,
  updateBillPrintersSchema,
  updateFloorSchema,
  updateKotStatusSchema,
  updateMenuItemSchema,
  updateOrderStateSchema,
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
import type { AppUpdateService } from "../update/app-update-service.js";
import { z } from "zod";

const hubFaviconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#18181b"/><path fill="#fff" d="M17 17h30v7H17zM17 29h30v7H17zM17 41h20v7H17z"/><path fill="#0f766e" d="M42 41h5v7h-5z"/></svg>';

const updatePackagePathSchema = z.object({
  packagePath: z.string().trim().min(1)
});

const updateInstallerPathSchema = z.object({
  installerPath: z.string().trim().min(1)
});

export function isRealtimeEventVisibleForRole(event: unknown, role: UserRole): boolean {
  if (role === "admin" || role === "captain") return true;
  const type = typeof event === "object" && event !== null && "type" in event ? String((event as { type?: unknown }).type ?? "") : "";
    const kdsChangingEvents = ["order.submitted", "order.cancelled", "order_items.cancelled", "table.shifted", "order_items.shifted"];
    if (role === "kitchen") {
      if (type === "order_state.updated") return Boolean((event as { result?: { kdsChanged?: unknown } }).result?.kdsChanged);
      return type.startsWith("kot.") || kdsChangingEvents.includes(type);
    }
  if (role === "waiter") {
    return [
      "order.submitted",
      "order.cancelled",
	      "order_items.cancelled",
	      "order_state.updated",
	      "table.shifted",
      "order_items.shifted",
      "kot.status_changed",
      "bill.generated",
      "bill.printed",
      "bill.reprinted",
      "bill.history_reprinted",
      "bill.revised",
      "bill.settled",
      "bill.nc_marked"
    ].includes(type);
  }
  return false;
}

export function realtimeEventForRole(event: unknown, role: UserRole): unknown | null {
  if (!isRealtimeEventVisibleForRole(event, role)) return null;
  if (event === null || typeof event !== "object" || !("type" in event)) return event;
  const type = String((event as { type?: unknown }).type ?? "");
  if (role === "kitchen" && !type.startsWith("kot.")) return { type, result: { kdsChanged: true } };
  if (role !== "waiter") return event;
  if (type.startsWith("bill.")) return { type, result: { tableStatusChanged: true } };
  return event;
}

export function resolvePairingHubUrl(input: {
  savedPublicUrl?: string;
  configuredPublicUrl?: string;
  requestProtocol?: string;
  requestHost?: string;
  fallbackLanAddress?: string;
}): string {
  const savedPublicUrl = normalizeHubUrlCandidate(input.savedPublicUrl);
  if (savedPublicUrl) return savedPublicUrl;
  const configuredPublicUrl = normalizeHubUrlCandidate(input.configuredPublicUrl);
  if (configuredPublicUrl) return configuredPublicUrl;

  const protocol = input.requestProtocol || "http";
  const requestHost = (input.requestHost || "localhost:3737").trim();
  if (!isLocalHost(requestHost)) return `${protocol}://${requestHost}`;

  const fallbackLanAddress = input.fallbackLanAddress?.trim();
  if (fallbackLanAddress) {
    const port = getPortFromHost(requestHost);
    return `${protocol}://${fallbackLanAddress}${port ? `:${port}` : ""}`;
  }

  return `${protocol}://${requestHost}`;
}

function normalizeHubUrlCandidate(value?: string): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function isLocalHost(host: string): boolean {
  const hostname = getHostname(host).toLowerCase();
  return hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.");
}

function getHostname(host: string): string {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0] ?? host;
}

function getPortFromHost(host: string): string | null {
  if (host.startsWith("[")) {
    const match = host.match(/\]:(\d+)$/);
    return match?.[1] ?? null;
  }
  const parts = host.split(":");
  return parts.length > 1 ? (parts.at(-1) ?? null) : null;
}

function detectLanIpv4Address(): string | undefined {
  return selectPairingLanAddress(networkInterfaces());
}

export function selectPairingLanAddress(
  interfaces: Record<string, Array<{ address: string; family: string | number; internal: boolean }> | undefined>
): string | undefined {
  const candidates: Array<{ address: string; score: number; index: number }> = [];
  let index = 0;
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if ((address.family === "IPv4" || address.family === 4) && !address.internal) {
        candidates.push({ address: address.address, score: scoreLanAddressCandidate(name, address.address), index });
        index += 1;
      }
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0]?.address;
}

function scoreLanAddressCandidate(interfaceName: string, address: string): number {
  const name = interfaceName.toLowerCase();
  let score = isPrivateIpv4Address(address) ? 100 : 10;
  if (address.startsWith("192.168.")) score += 30;
  else if (address.startsWith("10.")) score += 25;
  else if (isPrivate172Address(address)) score += 20;
  if (/\b(wi-?fi|wlan|wireless|ethernet|local area connection|en\d+|eth\d+)\b/i.test(interfaceName)) score += 50;
  if (/virtual|vmware|vbox|docker|wsl|hyper-v|vethernet|tailscale|zerotier|hamachi|vpn|wireguard|tun|tap|loopback|bridge/.test(name)) score -= 100;
  return score;
}

function isPrivateIpv4Address(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return a === 10 || isPrivate172Address(address) || (a === 192 && b === 168);
}

function isPrivate172Address(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  const [a, b] = parts;
  return parts.length === 4 && a === 172 && b !== undefined && b >= 16 && b <= 31;
}

export function createHubServer(input: {
  database: HubDatabase;
  backupService: BackupService;
  appUpdateService?: AppUpdateService;
  authService: AuthService;
  orderService: OrderService;
  printJobService: PrintJobService;
  syncBridge?: ConvexSyncBridge;
  eventBus: EventBus<unknown>;
  publicUrl?: string;
  requestRestart?: () => void;
}) {
  const app = Fastify({ logger: true });

  async function processCreatedPrintJobs(printJobIds: string[] = []) {
    const totals = { printed: 0, failed: 0, skipped: 0 };
    for (const printJobId of printJobIds) {
      const result = await input.printJobService.processOne(printJobId);
      totals.printed += result.printed;
      totals.failed += result.failed;
      totals.skipped += result.skipped ? 1 : 0;
    }
    return totals;
  }

  function requireAppUpdateService() {
    if (!input.appUpdateService) throw new DomainError("App updates are not configured", 503);
    return input.appUpdateService;
  }

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
	        hubConnection: input.orderService.getHubConnectionSettings(false)
	      }
	    };
	  });
  app.get("/sync/status", { preHandler: captainOrAdmin }, async () => input.orderService.getSyncStatus());
  app.post("/sync/push", { preHandler: adminOnly }, async () =>
    input.syncBridge ? dedupeInFlight(syncPushState, () => input.syncBridge!.pushPending()) : { pushed: 0, skipped: true }
  );
  app.post("/sync/pull", { preHandler: adminOnly }, async () =>
    input.syncBridge ? dedupeInFlight(syncPullState, () => input.syncBridge!.pullCloudSnapshot()) : { applied: 0, skipped: true }
  );
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
	  app.post("/menu-items/import-csv", { preHandler: adminOnly }, async (request) => {
	    const result = input.orderService.importMenuItemsFromCsv(importCsvSchema.parse(request.body).csv);
	    input.eventBus.publish({ type: "menu_items.imported", result });
	    return result;
	  });
	  app.post("/menu-items/bulk-delete", { preHandler: adminOnly }, async (request) => {
	    const result = input.orderService.bulkRemoveMenuItems("dish", bulkDeleteMenuItemsSchema.parse(request.body ?? {}));
	    input.eventBus.publish({ type: "menu_items.dish_bulk_removed", result });
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
	    const result = input.orderService.removeMenuItemWithApproval(params.id, menuItemDeleteApprovalSchema.parse(request.body ?? {}));
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
	  app.post("/alcohol/items/import-csv", { preHandler: adminOnly }, async (request) => {
	    const body = importAlcoholCsvSchema.parse(request.body);
	    const result = input.orderService.importAlcoholItemsFromCsv(body.csv, body.type);
	    input.eventBus.publish({ type: "alcohol_items.imported", result });
	    return result;
	  });
	  app.post("/alcohol/items/bulk-delete", { preHandler: adminOnly }, async (request) => {
	    const result = input.orderService.bulkRemoveMenuItems("alcohol", bulkDeleteAlcoholItemsSchema.parse(request.body ?? {}));
	    input.eventBus.publish({ type: "menu_items.alcohol_bulk_removed", result });
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
  app.get("/settings/bill-printers", { preHandler: captainOrAdmin }, async () => input.orderService.getBillPrinters());
  app.get("/settings/printer-mode", { preHandler: adminOnly }, async () => ({ mode: input.orderService.getPrinterOutputMode() }));
  app.put("/settings/printer-mode", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updatePrinterOutputMode(updatePrinterOutputModeSchema.parse(request.body).mode);
    input.eventBus.publish({ type: "printer_output_mode.updated", result });
    return result;
  });
  app.get("/system-printers", { preHandler: adminOnly }, async (request) => {
    const query = request.query as { refresh?: string };
    return listSystemPrinters({ forceRefresh: query.refresh === "1" || query.refresh === "true" });
  });
  app.put("/settings/receipt-printer", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateReceiptPrinter(updateReceiptPrinterSchema.parse(request.body));
    input.eventBus.publish({ type: "receipt_printer.updated", result });
    return result;
  });
  app.put("/settings/bill-printers", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateBillPrinters(updateBillPrintersSchema.parse(request.body));
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
	  app.get("/settings/master-pin/status", { preHandler: adminOnly }, async () => ({ masterPinConfigured: input.orderService.isMasterPinConfigured() }));
	  app.put("/settings/master-pin", { preHandler: adminOnly }, async (request) => {
	    const wasConfigured = input.orderService.isMasterPinConfigured();
	    const result = input.orderService.setMasterPin(setMasterPinSchema.parse(request.body));
	    input.eventBus.publish({ type: wasConfigured ? "master_pin.updated" : "master_pin.created", result });
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
  app.get("/reports/range", { preHandler: captainOrAdmin }, async (request) => {
    const parsed = reportRangeQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Invalid report range", 400);
    return input.orderService.getRangeReport(parsed.data);
  });
  app.get("/reports/alcohol-stock-movements", { preHandler: captainOrAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listAlcoholStockMovements(Number(query.limit ?? 100));
  });

  app.post("/orders/submit", { preHandler: orderRole }, async (request) => {
    const { result, replayed } = await withIdempotency(request, "orders.submit", () =>
      input.orderService.submitOrder(submitOrderSchema.parse(request.body), getSession(request))
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs(result.printJobIds);
    if (!replayed) input.eventBus.publish({ type: "order.submitted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/tables/move", { preHandler: orderMoveRole }, async (request) => {
    const result = input.orderService.moveTable(moveTableSchema.parse(request.body), getSession(request));
    const processed = await processCreatedPrintJobs(result.printJobIds);
    input.eventBus.publish({ type: "table.shifted", result: { ...result, processed } });
    return { ...result, processed };
  });

  app.post("/orders/items/move", { preHandler: orderMoveRole }, async (request) => {
    const result = input.orderService.moveOrderItems(moveOrderItemsSchema.parse(request.body), getSession(request));
    const processed = await processCreatedPrintJobs(result.printJobIds);
    input.eventBus.publish({ type: "order_items.shifted", result: { ...result, processed } });
    return { ...result, processed };
  });

  app.post("/orders/:id/cancel", { preHandler: captainOrAdmin }, async (request) => {
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

	  app.post("/orders/:id/items/cancel", { preHandler: captainOrAdmin }, async (request) => {
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

  app.post("/orders/:id/state", { preHandler: captainOrAdmin }, async (request) => {
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

  app.post("/kot/:id/reprint", { preHandler: captainOrAdmin }, async (request) => {
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

  app.post("/bills/:billId/reprint", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.reprint.${params.billId}`, () =>
      input.orderService.reprintBill(
        params.billId,
        reprintBillSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
      )
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.reprinted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/history-reprint", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const body = billPrintDestinationSchema.parse(request.body ?? {});
    const { result, replayed } = await withIdempotency(request, `bills.history-reprint.${params.billId}`, () =>
      input.orderService.reprintBillFromHistory(params.billId, session.name, body.printerSlot)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.history_reprinted", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

  app.post("/bills/:billId/print", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const body = billPrintDestinationSchema.parse(request.body ?? {});
    const { result, replayed } = await withIdempotency(request, `bills.print.${params.billId}`, () =>
      input.orderService.printBill(params.billId, session.name, body.printerSlot)
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.printed", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

	  app.post("/bills/:billId/revise", { preHandler: captainOrAdmin }, async (request) => {
	    const params = request.params as { billId: string };
	    const { result, replayed } = await withIdempotency(request, `bills.revise.${params.billId}`, () =>
	      input.orderService.reviseBill(params.billId, reviseBillSchema.parse(request.body))
	    );
    const processed = replayed ? undefined : await processCreatedPrintJobs(result.printJobIds);
	    if (!replayed) input.eventBus.publish({ type: "bill.revised", result: { ...result, processed } });
	    return { ...result, ...(processed ? { processed } : {}) };
	  });
	  app.post("/bills/:billId/history-edit", { preHandler: captainOrAdmin }, async (request) => {
	    const params = request.params as { billId: string };
	    const { result, replayed } = await withIdempotency(request, `bills.history-edit.${params.billId}`, () =>
	      input.orderService.editHistoryBill(params.billId, historyEditBillSchema.parse(request.body))
	    );
	    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
	    if (!replayed) input.eventBus.publish({ type: "bill.history_edited", result: { ...result, processed } });
	    return { ...result, ...(processed ? { processed } : {}) };
	  });

	  app.post("/bills/:billId/nc", { preHandler: captainOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.nc.${params.billId}`, () =>
      input.orderService.markBillNc(params.billId, markNcBillSchema.parse(request.body))
    );
    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
    if (!replayed) input.eventBus.publish({ type: "bill.nc_marked", result: { ...result, processed } });
    return { ...result, ...(processed ? { processed } : {}) };
  });

	  app.post("/bills/:orderId/generate", { preHandler: captainOrAdmin }, async (request) => {
	    const params = request.params as { orderId: string };
	    const body = generateBillSchema.parse(request.body ?? {});
	    const { result, replayed } = await withIdempotency(request, `bills.generate.${params.orderId}`, () =>
	      input.orderService.generateBill(params.orderId, body.printerSlot, body)
	    );
	    const processed = replayed ? undefined : await processCreatedPrintJobs([result.printJobId]);
	    if (!replayed) input.eventBus.publish({ type: "bill.generated", result: { ...result, processed } });
	    return { ...result, ...(processed ? { processed } : {}) };
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
    const body = billPrintDestinationSchema.parse(request.body ?? {});
    const result = input.orderService.enqueueTestBillPrint(session.name, body.printerSlot);
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
  app.get("/system/update/status", { preHandler: adminOnly }, async () => requireAppUpdateService().status());
  app.post("/system/update/validate", { preHandler: adminOnly }, async (request) => {
    const body = updatePackagePathSchema.parse(request.body);
    return requireAppUpdateService().validatePackage(body.packagePath);
  });
  app.post("/system/update/register-baseline", { preHandler: adminOnly }, async (request) => {
    const body = updatePackagePathSchema.parse(request.body);
    return requireAppUpdateService().registerBaseline(body.packagePath);
  });
  app.post("/system/update/register-installer-baseline", { preHandler: adminOnly }, async (request) => {
    const body = updateInstallerPathSchema.parse(request.body);
    return requireAppUpdateService().registerInstallerBaseline(body.installerPath);
  });
  app.post("/system/update/install", { preHandler: adminOnly }, async (request) => {
    const body = updatePackagePathSchema.parse(request.body);
    const managerPin = String(request.headers["x-manager-pin"] ?? "");
    input.orderService.verifyManagerPinForSession(managerPin);
    return requireAppUpdateService().installUpdate(body.packagePath);
  });
  app.post("/system/update/rollback", { preHandler: adminOnly }, async (request) => {
    const managerPin = String(request.headers["x-manager-pin"] ?? "");
    input.orderService.verifyManagerPinForSession(managerPin);
    return requireAppUpdateService().rollback();
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
