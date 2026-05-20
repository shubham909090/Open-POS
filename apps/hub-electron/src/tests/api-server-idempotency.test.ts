import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createHubServer, isRealtimeEventVisibleForRole, realtimeEventForRole, resolvePairingHubUrl, selectPairingLanAddress } from "../api/server.js";
import { BackupService } from "../db/backup-service.js";
import { cloudCommandFailures, idempotencyRecords } from "../db/drizzle-schema.js";
import { EventBus } from "../domain/event-bus.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";
import {
  createFailingPrintTestServer,
  createFileBackedTestServer,
  createTestServer,
  expectNoSocketMessage,
  insertApiDailySnapshot,
  listenForWebSockets,
  pairTestDevice,
  pairingPayload,
  setTestManagerPin,
  testManagerApproval,
  waitForSocketClose,
  waitForSocketMessage,
  waitForSocketOpen
} from "./api-server-helpers.js";

describe("Hub API idempotent order routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires manager approval after first bill print and exposes current business-day summary after settlement", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);
    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers,
      payload: pairingPayload("Captain billing tablet", "captain")
    });
    const pairing = pairingResponse.json<{ code: string }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Captain billing tablet" }
    });
    const captainHeaders = { "x-device-token": exchangeResponse.json<{ token: string }>().token };
    await app.inject({
      method: "PUT",
      url: "/settings/receipt-printer",
      headers,
      payload: { printerHost: "192.168.1.70", printerPort: 9100 }
    });
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers,
      payload: { newPin: "1234", updatedBy: "admin" }
    });
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: captainHeaders,
      payload: {
        tableId: "table-t1",
        captainId: "spoofed-captain",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const billResponse = await app.inject({ method: "POST", url: `/bills/${order.orderId}/generate`, headers: captainHeaders });
    const bill = billResponse.json<{ billId: string; totalPaise: number }>();

    const firstPrintResponse = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/print`,
      headers: captainHeaders
    });
    const repeatedPrintResponse = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/print`,
      headers: captainHeaders
    });
    const reprintResponse = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/reprint`,
      headers: captainHeaders,
      payload: {
        reason: "Customer copy",
        requestedBy: "captain-1",
        managerApproval: { pin: "1234", reason: "Customer copy", approvedBy: "manager" }
      }
    });
    const settleResponse = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/settle`,
      headers: captainHeaders,
      payload: { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" }
    });
    const summaryResponse = await app.inject({
      method: "GET",
      url: "/business-day/current-summary",
      headers: captainHeaders
    });

    expect(firstPrintResponse.statusCode).toBe(400);
    expect(firstPrintResponse.json()).toMatchObject({ error: "Bill was already printed. Use manager-approved reprint." });
    expect(repeatedPrintResponse.statusCode).toBe(400);
    expect(repeatedPrintResponse.json()).toMatchObject({ error: "Bill was already printed. Use manager-approved reprint." });
    expect(reprintResponse.statusCode).toBe(200);
    expect(settleResponse.statusCode).toBe(200);
    expect(settleResponse.json()).toMatchObject({ status: "paid" });
    expect(settleResponse.json()).not.toHaveProperty("printJobId");
    expect(settleResponse.json()).not.toHaveProperty("processed");
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json()).toMatchObject({ paidBills: 1, unpaidBills: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_type = 'BILL'").get()).toEqual({
      count: 2
    });

    await app.close();
    database.close();
  });

  it("replays idempotent order submissions without duplicate orders or KOTs", async () => {
    const { app, database } = createTestServer();
    const headers = {
      "x-device-token": "test-admin-token",
      "idempotency-key": "android-submit-1"
    };
    const payload = {
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    };

    const first = await app.inject({ method: "POST", url: "/orders/submit", headers, payload });
    const second = await app.inject({ method: "POST", url: "/orders/submit", headers, payload });

    expect(first.json()).toMatchObject({ processed: { printed: 1, failed: 0 } });
    expect(second.json()).toMatchObject({ orderId: first.json<{ orderId: string }>().orderId, kotIds: first.json<{ kotIds: string[] }>().kotIds });
    expect(second.json()).not.toHaveProperty("processed");
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM orders").get()).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM kots").get()).toEqual({ count: 1 });

    await app.close();
    database.close();
  });

  it("prints newly submitted KOT jobs immediately from the submit action", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ processed: { printed: 1, failed: 0 } });
    expect(database.db.prepare("SELECT status, attempts FROM print_jobs LIMIT 1").get()).toEqual({ status: "printed", attempts: 1 });

    await app.close();
    database.close();
  });

  it("keeps the order when immediate printing fails and leaves the job retryable", async () => {
    const { app, database } = createFailingPrintTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ processed: { printed: 0, failed: 1 } });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM orders").get()).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT status, attempts, last_error FROM print_jobs LIMIT 1").get()).toEqual({
      status: "failed",
      attempts: 1,
      last_error: "printer offline"
    });

    await app.close();
    database.close();
  });

  it("rejects an idempotency key reused with a different payload", async () => {
    const { app, database } = createTestServer();
    const headers = {
      "x-device-token": "test-admin-token",
      "idempotency-key": "android-submit-2"
    };

    await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const replayWithDifferentBody = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
      }
    });

    expect(replayWithDifferentBody.statusCode).toBe(409);

    await app.close();
    database.close();
  });

  it("rejects duplicate idempotent requests while the first request is in progress", async () => {
    const { app, database } = createTestServer();
    const payload = {
      tableId: "table-t1",
      captainId: "waiter-1",
      pax: 1,
      orderType: "dine_in",
      items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
    };
    const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    database.orm
      .insert(idempotencyRecords)
      .values({
        key: "android-submit-progress",
        route: "orders.submit",
        requestHash,
        status: "in_progress",
        responseJson: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .run();

    const response = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: {
        "x-device-token": "test-admin-token",
        "idempotency-key": "android-submit-progress"
      },
      payload
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Request is already in progress. Retry shortly." });

    await app.close();
    database.close();
  });
});
