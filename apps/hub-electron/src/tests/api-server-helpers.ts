import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createHubServer, isRealtimeEventVisibleForRole, realtimeEventForRole, resolvePairingHubUrl, selectPairingLanAddress } from "../api/server.js";
import type { FastifyInstance } from "fastify";
import { BackupService } from "../db/backup-service.js";
import { HubDatabase } from "../db/database.js";
import { cloudCommandFailures, idempotencyRecords } from "../db/drizzle-schema.js";
import { AuthService } from "../domain/auth-service.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import type { PrintTarget } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";

export function createTestServer(options: { publicUrl?: string; requestRestart?: () => void } = {}) {
  const hub = createTestHub();
  const printJobService = new PrintJobService(hub.database.orm, new DryRunPrinterAdapter());
  const app = createHubServer({
    database: hub.database,
    backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
    authService: hub.authService,
    orderService: hub.orderService,
    printJobService,
    syncBridge: new ConvexSyncBridge(hub.database.orm, undefined, undefined),
    eventBus: new EventBus<unknown>(),
    publicUrl: options.publicUrl,
    requestRestart: options.requestRestart
  });

  return { ...hub, app };
}

export function createFileBackedTestServer(root: string, options: { requestRestart?: () => void } = {}) {
  const databasePath = join(root, "hub.sqlite");
  const backupDir = join(root, "backups");
  const database = new HubDatabase(databasePath);
  database.migrate();
  database.seedDemoData();
  const authService = new AuthService(database.orm);
  authService.seedAdminDevice("test-admin-token");
  const orderService = new OrderService(database.orm);
  const printJobService = new PrintJobService(database.orm, new DryRunPrinterAdapter());
  const app = createHubServer({
    database,
    backupService: new BackupService(database, databasePath, backupDir),
    authService,
    orderService,
    printJobService,
    syncBridge: new ConvexSyncBridge(database.orm, undefined, undefined),
    eventBus: new EventBus<unknown>(),
    requestRestart: options.requestRestart
  });
  return { app, database, databasePath };
}

export function createFailingPrintTestServer() {
  const hub = createTestHub();
  const printJobService = new PrintJobService(hub.database.orm, new DryRunPrinterAdapter(), new FailingPrinterAdapter());
  const app = createHubServer({
    database: hub.database,
    backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
    authService: hub.authService,
    orderService: hub.orderService,
    printJobService,
    syncBridge: new ConvexSyncBridge(hub.database.orm, undefined, undefined),
    eventBus: new EventBus<unknown>()
  });
  return { ...hub, app };
}

export const testManagerApproval = { pin: "1234", reason: "Pair device", approvedBy: "manager" };

export function insertApiDailySnapshot(database: HubDatabase, input: { id: string; businessDate: string; finalSalesPaise: number; cashPaise?: number; billSummaries?: unknown[]; status?: "finalized" | "active" }) {
  const status = input.status ?? "finalized";
  database.db
    .prepare(
      `INSERT INTO pos_days (id, outlet_id, business_date, status, period_start_at, period_end_at, created_at, finalized_at)
       VALUES (?, 'outlet-main', ?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.businessDate, status, `${input.businessDate}T00:30:00.000Z`, `${input.businessDate}T18:30:00.000Z`, `${input.businessDate}T00:30:00.000Z`, status === "finalized" ? `${input.businessDate}T19:00:00.000Z` : null);
  if (status !== "finalized") {
    database.db
      .prepare(
        `INSERT INTO orders (id, table_id, pos_day_id, order_type, status, pax, captain_id, created_at, updated_at)
         VALUES (?, 'table-t1', ?, 'dine_in', 'open', 1, 'captain-test', ?, ?)`
      )
      .run(`order-${input.id}`, input.id, `${input.businessDate}T12:00:00.000Z`, `${input.businessDate}T12:00:00.000Z`);
    return;
  }
  database.db
    .prepare(
      `INSERT INTO daily_report_snapshots (
        pos_day_id, business_date, status, bill_count, open_orders, billed_orders, paid_bills, unpaid_bills, cancelled_orders,
        gross_sales_paise, discount_paise, tip_paise, final_sales_paise,
        cash_payments_paise, upi_payments_paise, card_payments_paise, online_payments_paise, total_payments_paise, non_cash_payments_paise,
        bill_summaries_json, item_summaries_json, group_summaries_json, finalized_at, updated_at
      ) VALUES (?, ?, 'finalized', 1, 0, 0, 1, 0, 0, ?, 0, 0, ?, ?, 0, 0, 0, ?, 0, ?, '[]', '[]', ?, ?)`
    )
    .run(
      input.id,
      input.businessDate,
      input.finalSalesPaise,
      input.finalSalesPaise,
      input.cashPaise ?? input.finalSalesPaise,
      input.cashPaise ?? input.finalSalesPaise,
      JSON.stringify(input.billSummaries ?? []),
      `${input.businessDate}T19:00:00.000Z`,
      `${input.businessDate}T19:00:00.000Z`
    );
}

export class FailingPrinterAdapter {
  async print(_payload: PrintTarget): Promise<void> {
    throw new Error("printer offline");
  }
}

export async function setTestManagerPin(app: FastifyInstance, pin = "1234") {
  await app.inject({
    method: "PUT",
    url: "/settings/manager-pin",
    payload: { newPin: pin, updatedBy: "owner" }
  });
}

export async function pairTestDevice(app: FastifyInstance, role: "admin" | "captain" | "waiter" | "kitchen", name: string) {
  const pairingResponse = await app.inject({
    method: "POST",
    url: "/devices/pairing-codes",
    headers: { "x-device-token": "test-admin-token" },
    payload: pairingPayload(name, role)
  });
  const pairing = pairingResponse.json<{ code: string }>();
  const exchangeResponse = await app.inject({
    method: "POST",
    url: "/devices/pair/exchange",
    payload: { code: pairing.code, deviceName: name }
  });
  return exchangeResponse.json<{ token: string }>();
}

export async function listenForWebSockets(app: FastifyInstance): Promise<string> {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address() as AddressInfo | null;
  if (!address) throw new Error("Expected test server to listen on a TCP port");
  return `ws://127.0.0.1:${address.port}`;
}

export function waitForSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for websocket open")), 1_000);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function waitForSocketClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for websocket close")), 1_000);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function waitForSocketMessage<T>(
  socket: WebSocket,
  predicate: (message: T) => boolean = () => true,
  timeoutMs = 1_500
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(String(data)) as T;
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

export function expectNoSocketMessage<T>(socket: WebSocket, predicate: (message: T) => boolean, timeoutMs = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(String(data)) as T;
      if (!predicate(message)) return;
      cleanup();
      reject(new Error(`Received unexpected websocket message: ${String(data)}`));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

export function pairingPayload(deviceName: string, role: "admin" | "captain" | "waiter" | "kitchen") {
  return { deviceName, role, expiresInMinutes: 10, managerApproval: testManagerApproval };
}
