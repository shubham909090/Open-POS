import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { and, eq } from "drizzle-orm";
import Fastify from "fastify";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import {
  closePosDaySchema,
  assignModifierGroupSchema,
  createBackupSchema,
  createFloorSchema,
  createMenuItemSchema,
  createModifierGroupSchema,
  createModifierOptionSchema,
  createNoteTemplateSchema,
  createPairingCodeSchema,
  createProductionUnitSchema,
  createTableSchema,
  exchangePairingCodeSchema,
  openPosDaySchema,
  reprintKotSchema,
  revokeDeviceSchema,
  retryPrintJobSchema,
  settleBillSchema,
  scheduleRestoreSchema,
  submitOrderSchema,
  updateKotStatusSchema,
  updateMenuItemSchema,
  updateReceiptPrinterSchema,
  type UserRole
} from "@gaurav-pos/shared";
import type { HubDatabase } from "../db/database.js";
import type { BackupService } from "../db/backup-service.js";
import { idempotencyRecords } from "../db/drizzle-schema.js";
import { AuthService } from "../domain/auth-service.js";
import { DomainError } from "../domain/errors.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import type { PrintJobService } from "../printing/print-job-service.js";
import { listSystemPrinters } from "../printing/printer-discovery.js";
import type { ConvexSyncBridge } from "../sync/convex-sync.js";

export function createHubServer(input: {
  database: HubDatabase;
  backupService: BackupService;
  authService: AuthService;
  orderService: OrderService;
  printJobService: PrintJobService;
  syncBridge?: ConvexSyncBridge;
  eventBus: EventBus<unknown>;
  publicUrl?: string;
}) {
  const app = Fastify({ logger: true });

  app.register(websocket);
  app.register(fastifyStatic, {
    root: fileURLToPath(new URL("../public", import.meta.url)),
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

  const anyRole = requireRoles(["admin", "cashier", "waiter", "kitchen"]);
  const adminOnly = requireRoles(["admin"]);
  const cashierOrAdmin = requireRoles(["admin", "cashier"]);
  const orderRole = requireRoles(["admin", "cashier", "waiter"]);
  const kitchenRole = requireRoles(["admin", "cashier", "kitchen"]);
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
  app.get("/sync/bootstrap", { preHandler: anyRole }, async () => input.orderService.bootstrap());
  app.get("/sync/status", { preHandler: cashierOrAdmin }, async () => input.orderService.getSyncStatus());
  app.post("/sync/push", { preHandler: adminOnly }, async () => input.syncBridge?.pushPending() ?? { pushed: 0, skipped: true });
  app.post("/sync/pull", { preHandler: adminOnly }, async () => input.syncBridge?.pullCloudSnapshot() ?? { applied: 0, skipped: true });
  app.get("/floors", { preHandler: anyRole }, async () => input.orderService.listFloors());
  app.post("/floors", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createFloor(createFloorSchema.parse(request.body));
    input.eventBus.publish({ type: "floor.created", result });
    return result;
  });
  app.get("/tables", { preHandler: anyRole }, async () => input.orderService.listTables());
  app.post("/tables", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createTable(createTableSchema.parse(request.body));
    input.eventBus.publish({ type: "table.created", result });
    return result;
  });
  app.get("/tables/:id/order", { preHandler: anyRole }, async (request) => {
    const params = request.params as { id: string };
    return input.orderService.getTableOrder(params.id);
  });
  app.get("/production-units", { preHandler: anyRole }, async () => input.orderService.listProductionUnits());
  app.post("/production-units", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createProductionUnit(createProductionUnitSchema.parse(request.body));
    input.eventBus.publish({ type: "production_unit.created", result });
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
  app.patch("/menu-items/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateMenuItem(params.id, updateMenuItemSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.updated", result });
    return result;
  });
  app.get("/modifier-groups", { preHandler: anyRole }, async () => input.orderService.listModifierCatalog());
  app.post("/modifier-groups", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createModifierGroup(createModifierGroupSchema.parse(request.body));
    input.eventBus.publish({ type: "modifier_group.created", result });
    return result;
  });
  app.post("/modifier-options", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createModifierOption(createModifierOptionSchema.parse(request.body));
    input.eventBus.publish({ type: "modifier_option.created", result });
    return result;
  });
  app.post("/menu-item-modifier-groups", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.assignModifierGroup(assignModifierGroupSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.modifier_group_assigned", result });
    return result;
  });
  app.get("/note-templates", { preHandler: anyRole }, async () => input.orderService.listNoteTemplates());
  app.post("/note-templates", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.createNoteTemplate(createNoteTemplateSchema.parse(request.body));
    input.eventBus.publish({ type: "note_template.created", result });
    return result;
  });
  app.get("/settings/receipt-printer", { preHandler: cashierOrAdmin }, async () => input.orderService.getReceiptPrinter());
  app.get("/system-printers", { preHandler: adminOnly }, async () => listSystemPrinters());
  app.put("/settings/receipt-printer", { preHandler: adminOnly }, async (request) => {
    const result = input.orderService.updateReceiptPrinter(updateReceiptPrinterSchema.parse(request.body));
    input.eventBus.publish({ type: "receipt_printer.updated", result });
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
  app.get("/orders/:id", { preHandler: anyRole }, async (request) => {
    const params = request.params as { id: string };
    return input.orderService.getOrder(params.id);
  });

  app.get("/realtime", { websocket: true }, (socket, request) => {
    try {
      input.authService.authenticate(getToken(request));
    } catch {
      socket.close();
      return;
    }
    const unsubscribe = input.eventBus.subscribe((event) => {
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
    return result;
  });
  app.get("/pos-days/close-summary", { preHandler: cashierOrAdmin }, async () => input.orderService.getCloseSummary());

  app.post("/orders/submit", { preHandler: orderRole }, async (request) => {
    const { result, replayed } = await withIdempotency(request, "orders.submit", () =>
      input.orderService.submitOrder(submitOrderSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "order.submitted", result });
    return result;
  });

  app.post("/orders/:id/cancel", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const body = request.body as { reason?: string };
    const result = input.orderService.cancelOrder(params.id, body.reason ?? "Cancelled from hub");
    input.eventBus.publish({ type: "order.cancelled", result });
    return result;
  });

  app.post("/kot/:id/reprint", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { id: string };
    const { result, replayed } = await withIdempotency(request, `kot.reprint.${params.id}`, () =>
      input.orderService.reprintKot(params.id, reprintKotSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "kot.reprinted", result });
    return result;
  });

  app.post("/bills/:billId/reprint", { preHandler: cashierOrAdmin }, async (request) => {
    const params = request.params as { billId: string };
    const { result, replayed } = await withIdempotency(request, `bills.reprint.${params.billId}`, () =>
      input.orderService.reprintBill(params.billId, reprintKotSchema.parse(request.body))
    );
    if (!replayed) input.eventBus.publish({ type: "bill.reprinted", result });
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
    const { result, replayed } = await withIdempotency(request, `bills.settle.${params.billId}`, () =>
      input.orderService.settleBill(params.billId, settleBillSchema.parse(request.body))
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
