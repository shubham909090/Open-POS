import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { and, eq } from "drizzle-orm";
import Fastify from "fastify";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import {
  closePosDaySchema,
  cancelOrderSchema,
  createBackupSchema,
  createFloorSchema,
  createMenuItemSchema,
  createPairingCodeSchema,
  createProductionUnitSchema,
  createSaleGroupSchema,
  createTableSchema,
  exchangePairingCodeSchema,
  managerPinSchema,
  markNcBillSchema,
  moveOrderItemsSchema,
  moveTableSchema,
  openPosDaySchema,
  reprintKotSchema,
  revokeDeviceSchema,
  reviseBillSchema,
  retryPrintJobSchema,
  settleBillSchema,
  scheduleRestoreSchema,
  submitOrderSchema,
  ticketTemplateSchema,
  updateFloorSchema,
  updateKotStatusSchema,
  updateMenuItemSchema,
  updateProductionUnitSchema,
  updateReceiptPrinterSchema,
  updateSaleGroupSchema,
  updateTableSchema,
  type UserRole
} from "@gaurav-pos/shared";
import type { HubDatabase } from "../db/database.js";
import type { BackupService } from "../db/backup-service.js";
import { idempotencyRecords } from "../db/drizzle-schema.js";
import { AuthService } from "../domain/auth-service.js";
import type { LocalDeviceSession } from "../domain/auth-service.js";
import { DomainError } from "../domain/errors.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import type { PrintJobService } from "../printing/print-job-service.js";
import { listSystemPrinters } from "../printing/printer-discovery.js";
import type { ConvexSyncBridge } from "../sync/convex-sync.js";

export function isRealtimeEventVisibleForRole(event: unknown, role: UserRole): boolean {
  if (role === "admin" || role === "cashier") return true;
  const type = typeof event === "object" && event !== null && "type" in event ? String((event as { type?: unknown }).type ?? "") : "";
  if (role === "kitchen") return type.startsWith("kot.");
  if (role === "captain" || role === "waiter") {
    return ["order.submitted", "table.shifted", "order_items.shifted", "kot.status_changed", "pos_day.opened", "pos_day.closed"].includes(type);
  }
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
  printerDryRun?: boolean;
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

  const anyRole = requireRoles(["admin", "cashier", "captain", "waiter", "kitchen"]);
  const adminOnly = requireRoles(["admin"]);
  const cashierOrAdmin = requireRoles(["admin", "cashier"]);
  const orderRole = requireRoles(["admin", "cashier", "captain", "waiter"]);
  const orderMoveRole = requireRoles(["admin", "cashier", "captain"]);
  const kitchenRole = requireRoles(["admin", "cashier", "kitchen"]);
  const publicBootstrapForRole = (bootstrap: Record<string, unknown>, role: UserRole): Record<string, unknown> => {
    if (role === "admin" || role === "cashier") return bootstrap;
    const { ticketTemplate: _ticketTemplate, printJobs: _printJobs, syncStatus: _syncStatus, ...safeBootstrap } = bootstrap;
    return safeBootstrap;
  };
  const tableOrderForRole = (tableOrder: unknown, role: UserRole): unknown => {
    if (role === "admin" || role === "cashier" || tableOrder === null || typeof tableOrder !== "object") return tableOrder;
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
        responseJson: idempotencyRecords.responseJson
      })
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.route, route)))
      .get();
    if (existing && existing.requestHash !== requestHash) {
      throw new DomainError("Idempotency key was already used with a different request body", 409);
    }
    if (existing) return { result: JSON.parse(existing.responseJson) as T, replayed: true };

    const result = handler();
    input.database.orm
      .insert(idempotencyRecords)
      .values({ key, route, requestHash, responseJson: JSON.stringify(result), createdAt: new Date().toISOString() })
      .run();
    return { result, replayed: false };
  };

  app.get("/health", async () => ({ ok: true }));
  app.post("/devices/pair/exchange", async (request) =>
    input.authService.exchangePairingCode(exchangePairingCodeSchema.parse(request.body))
  );
  app.get("/sync/bootstrap", { preHandler: anyRole }, async (request) => {
    const session = getSession(request);
    const bootstrap = input.orderService.bootstrap() as Record<string, unknown>;
    return {
      ...publicBootstrapForRole(bootstrap, session.role),
      setup: {
        printerDryRun: Boolean(input.printerDryRun)
      }
    };
  });
  app.get("/sync/status", { preHandler: cashierOrAdmin }, async () => input.orderService.getSyncStatus());
  app.post("/sync/push", { preHandler: adminOnly }, async () => input.syncBridge?.pushPending() ?? { pushed: 0, skipped: true });
  app.post("/sync/pull", { preHandler: adminOnly }, async () => input.syncBridge?.pullCloudSnapshot() ?? { applied: 0, skipped: true });
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
  app.get("/settings/receipt-printer", { preHandler: cashierOrAdmin }, async () => input.orderService.getReceiptPrinter());
  app.get("/system-printers", { preHandler: adminOnly }, async () => listSystemPrinters());
  app.put("/settings/receipt-printer", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateReceiptPrinter(updateReceiptPrinterSchema.parse(request.body));
    input.eventBus.publish({ type: "receipt_printer.updated", result });
    return result;
  });
  app.put("/settings/manager-pin", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.setManagerPin(managerPinSchema.parse(request.body));
    input.eventBus.publish({ type: "manager_pin.updated", result });
    return result;
  });
  app.get("/settings/ticket-template", { preHandler: cashierOrAdmin }, async () => input.orderService.getTicketTemplate());
  app.put("/settings/ticket-template", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateTicketTemplate(ticketTemplateSchema.parse(request.body));
    input.eventBus.publish({ type: "ticket_template.updated", result });
    return result;
  });
  app.get("/devices", { preHandler: adminOnly }, async () => input.authService.listDevices());
  app.post("/devices/pairing-codes", { preHandler: adminOnly }, async (request) => {
    const body = createPairingCodeSchema.parse(request.body);
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
    return input.orderService.getOrder(params.id);
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

  app.post("/pos-days/open", { preHandler: cashierOrAdmin }, async (request) => {
    const result = input.orderService.openPosDay(openPosDaySchema.parse(request.body));
    input.eventBus.publish({ type: "pos_day.opened", result });
    return result;
  });

  app.post("/pos-days/close", { preHandler: cashierOrAdmin }, async (request) => {
    const result = input.orderService.closePosDay(closePosDaySchema.parse(request.body));
    input.eventBus.publish({ type: "pos_day.closed", result });
    void input.syncBridge?.pushPending().catch((error) => app.log.warn(error, "Close-day report sync will retry later"));
    return result;
  });
  app.get("/pos-days/close-summary", { preHandler: cashierOrAdmin }, async () => input.orderService.getCloseSummary());
  app.get("/reports/daily", { preHandler: cashierOrAdmin }, async () => input.orderService.listDailyReports());
  app.get("/reports/daily/:posDayId", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { posDayId: string };
    return input.orderService.getDailyReport(params.posDayId);
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

  app.post("/orders/:id/cancel", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const session = getSession(request);
    const result = input.orderService.cancelOrder(
      params.id,
      cancelOrderSchema.parse({ ...(request.body as Record<string, unknown>), requestedBy: session.name })
    );
    input.eventBus.publish({ type: "order.cancelled", result });
    return result;
  });

  app.post("/kot/:id/reprint", { preHandler: cashierOrAdmin }, async (request) => {
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

  app.post("/bills/:billId/reprint", { preHandler: cashierOrAdmin }, async (request) => {
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

  app.post("/bills/:billId/print", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const session = getSession(request);
    const { result, replayed } = await withIdempotency(request, `bills.print.${params.billId}`, () =>
      input.orderService.printBill(params.billId, session.name)
    );
    if (!replayed) input.eventBus.publish({ type: "bill.printed", result });
    return result;
  });

  app.post("/bills/:billId/revise", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.revise.${params.billId}`, () =>
      input.orderService.reviseBill(params.billId, reviseBillSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "bill.revised", result });
    return result;
  });

  app.post("/bills/:billId/nc", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.nc.${params.billId}`, () =>
      input.orderService.markBillNc(params.billId, markNcBillSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "bill.nc_marked", result });
    return result;
  });

  app.post("/bills/:orderId/generate", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { orderId: string };
    const { result, replayed } = await withIdempotency(request, `bills.generate.${params.orderId}`, () =>
      input.orderService.generateBill(params.orderId)
    );
    if (!replayed) input.eventBus.publish({ type: "bill.generated", result });
    return result;
  });

  app.post("/bills/:billId/settle", { preHandler: cashierOrAdmin }, async (request) => {
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

  app.post("/print-jobs/process", { preHandler: cashierOrAdmin }, async () => input.printJobService.processPending());
  app.get("/print-jobs", { preHandler: cashierOrAdmin }, async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listPrintJobs(Number(query.limit ?? 50));
  });
  app.post("/print-jobs/:id/retry", { preHandler: cashierOrAdmin }, async (request) => {
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

  return app;
}
