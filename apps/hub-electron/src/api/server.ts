import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import {
  closePosDaySchema,
  createFloorSchema,
  createMenuItemSchema,
  createProductionUnitSchema,
  createTableSchema,
  openPosDaySchema,
  reprintKotSchema,
  retryPrintJobSchema,
  settleBillSchema,
  submitOrderSchema,
  updateKotStatusSchema
} from "@gaurav-pos/shared";
import type { HubDatabase } from "../db/database.js";
import { DomainError } from "../domain/errors.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import type { PrintJobService } from "../printing/print-job-service.js";
import type { ConvexSyncBridge } from "../sync/convex-sync.js";

export function createHubServer(input: {
  database: HubDatabase;
  orderService: OrderService;
  printJobService: PrintJobService;
  syncBridge?: ConvexSyncBridge;
  eventBus: EventBus<unknown>;
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

  app.get("/health", async () => ({ ok: true }));
  app.get("/sync/bootstrap", async () => input.orderService.bootstrap());
  app.get("/sync/status", async () => input.orderService.getSyncStatus());
  app.post("/sync/push", async () => input.syncBridge?.pushPending() ?? { pushed: 0, skipped: true });
  app.get("/floors", async () => input.orderService.listFloors());
  app.post("/floors", async (request) => {
    const result = input.orderService.createFloor(createFloorSchema.parse(request.body));
    input.eventBus.publish({ type: "floor.created", result });
    return result;
  });
  app.get("/tables", async () => input.orderService.listTables());
  app.post("/tables", async (request) => {
    const result = input.orderService.createTable(createTableSchema.parse(request.body));
    input.eventBus.publish({ type: "table.created", result });
    return result;
  });
  app.get("/tables/:id/order", async (request) => {
    const params = request.params as { id: string };
    return input.orderService.getTableOrder(params.id);
  });
  app.get("/production-units", async () => input.orderService.listProductionUnits());
  app.post("/production-units", async (request) => {
    const result = input.orderService.createProductionUnit(createProductionUnitSchema.parse(request.body));
    input.eventBus.publish({ type: "production_unit.created", result });
    return result;
  });
  app.get("/menu-items", async (request) => {
    const query = request.query as { includeInactive?: string };
    return input.orderService.listMenuItems(query.includeInactive === "1" || query.includeInactive === "true");
  });
  app.post("/menu-items", async (request) => {
    const result = input.orderService.createMenuItem(createMenuItemSchema.parse(request.body));
    input.eventBus.publish({ type: "menu_item.created", result });
    return result;
  });
  app.patch("/menu-items/:id/active", async (request) => {
    const params = request.params as { id: string };
    const body = request.body as { active?: boolean };
    const result = input.orderService.setMenuItemActive(params.id, Boolean(body.active));
    input.eventBus.publish({ type: "menu_item.active_changed", result });
    return result;
  });
  app.get("/kds/:productionUnitId", async (request) => {
    const params = request.params as { productionUnitId: string };
    return input.orderService.listKds(params.productionUnitId);
  });
  app.patch("/kot/:id/status", async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.updateKotStatus(params.id, updateKotStatusSchema.parse(request.body));
    input.eventBus.publish({ type: "kot.status_changed", result });
    return result;
  });
  app.get("/orders/:id", async (request) => {
    const params = request.params as { id: string };
    return input.orderService.getOrder(params.id);
  });

  app.get("/realtime", { websocket: true }, (socket) => {
    const unsubscribe = input.eventBus.subscribe((event) => {
      socket.send(JSON.stringify(event));
    });
    socket.on("close", unsubscribe);
  });

  app.post("/pos-days/open", async (request) => {
    const result = input.orderService.openPosDay(openPosDaySchema.parse(request.body));
    input.eventBus.publish({ type: "pos_day.opened", result });
    return result;
  });

  app.post("/pos-days/close", async (request) => {
    const result = input.orderService.closePosDay(closePosDaySchema.parse(request.body));
    input.eventBus.publish({ type: "pos_day.closed", result });
    return result;
  });

  app.post("/orders/submit", async (request) => {
    const result = input.orderService.submitOrder(submitOrderSchema.parse(request.body));
    input.eventBus.publish({ type: "order.submitted", result });
    return result;
  });

  app.post("/orders/:id/cancel", async (request) => {
    const params = request.params as { id: string };
    const body = request.body as { reason?: string };
    const result = input.orderService.cancelOrder(params.id, body.reason ?? "Cancelled from hub");
    input.eventBus.publish({ type: "order.cancelled", result });
    return result;
  });

  app.post("/kot/:id/reprint", async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.reprintKot(params.id, reprintKotSchema.parse(request.body));
    input.eventBus.publish({ type: "kot.reprinted", result });
    return result;
  });

  app.post("/bills/:orderId/generate", async (request) => {
    const params = request.params as { orderId: string };
    const result = input.orderService.generateBill(params.orderId);
    input.eventBus.publish({ type: "bill.generated", result });
    return result;
  });

  app.post("/bills/:billId/settle", async (request) => {
    const params = request.params as { billId: string };
    const result = input.orderService.settleBill(params.billId, settleBillSchema.parse(request.body));
    input.eventBus.publish({ type: "bill.settled", result });
    return result;
  });

  app.post("/print-jobs/process", async () => input.printJobService.processPending());
  app.get("/print-jobs", async (request) => {
    const query = request.query as { limit?: string };
    return input.orderService.listPrintJobs(Number(query.limit ?? 50));
  });
  app.post("/print-jobs/:id/retry", async (request) => {
    const params = request.params as { id: string };
    const result = input.orderService.retryPrintJob(params.id, retryPrintJobSchema.parse(request.body));
    input.eventBus.publish({ type: "print_job.retry_requested", result });
    return result;
  });

  return app;
}
