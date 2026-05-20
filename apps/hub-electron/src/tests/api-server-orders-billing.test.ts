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

describe("Hub API order and billing routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits KOT-only orders without processing kitchen print jobs", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        pax: 2,
        orderType: "dine_in",
        printMode: "kot",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ kotIds: string[]; printJobIds: string[]; processed: { printed: number; failed: number; skipped: number } }>()).toMatchObject({
      kotIds: expect.any(Array),
      printJobIds: [],
      processed: { printed: 0, failed: 0, skipped: 0 }
    });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM kots").get()).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs").get()).toEqual({ count: 0 });

    await app.close();
    database.close();
  });

  it("generates and processes a printed bill in one bill action", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: { tableId: "table-t1", pax: 1, orderType: "dine_in", printMode: "kot", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] }
    });
    const order = orderResponse.json<{ orderId: string }>();

    const billResponse = await app.inject({ method: "POST", url: `/bills/${order.orderId}/generate`, headers });

    expect(billResponse.statusCode).toBe(200);
    expect(billResponse.json()).toMatchObject({
      billNumber: 1,
      printJobId: expect.any(String),
      processed: { printed: 1, failed: 0, skipped: 0 }
    });

    await app.close();
    database.close();
  });

  it("reprints a bill from order history without manager approval", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: { tableId: "table-t1", pax: 1, orderType: "dine_in", printMode: "kot", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const billResponse = await app.inject({ method: "POST", url: `/bills/${order.orderId}/generate`, headers });
    const bill = billResponse.json<{ billId: string }>();
    const summaryResponse = await app.inject({ method: "GET", url: "/business-day/current-summary", headers });

    const reprintResponse = await app.inject({ method: "POST", url: `/bills/${bill.billId}/history-reprint`, headers });

    expect(summaryResponse.statusCode).toBe(200);
    const summaryBill = summaryResponse.json<{ billSummaries: Array<{ subtotalPaise: number; taxPaise: number; totalPaise: number; items: Array<{ name: string; quantity: number }> }> }>().billSummaries[0];
    expect(summaryBill).toMatchObject({ subtotalPaise: 18000, taxPaise: 900, totalPaise: 18000 });
    expect(summaryBill?.items).toEqual([
      expect.objectContaining({ name: "Dal Fry", quantity: 1, unitPricePaise: 18000, lineTotalPaise: 18000 })
    ]);
    expect(reprintResponse.statusCode).toBe(200);
    expect(reprintResponse.json()).toMatchObject({ printJobId: expect.any(String), processed: { printed: 1, failed: 0, skipped: 0 } });
    expect(database.db.prepare("SELECT print_count FROM bills WHERE id = ?").get(bill.billId)).toEqual({ print_count: 2 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE type = 'bill.history_reprinted'").get()).toEqual({ count: 1 });
    const printJob = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = ? ORDER BY created_at DESC LIMIT 1").get(bill.billId) as { payload: string };
    expect(printJob.payload).not.toContain("REPRINT");

    await app.close();
    database.close();
  });

  it("returns closed-only range reports and lazily includes bill history", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    insertApiDailySnapshot(database, {
      id: "api-day-1",
      businessDate: "2026-05-01",
      finalSalesPaise: 10_000,
      billSummaries: [{ billId: "bill-1", billNumber: 1, orderId: "order-1", tableName: "T1", status: "paid", totalPaise: 10_000, discountPaise: 0, tipPaise: 0, finalTotalPaise: 10_000, paidPaise: 10_000, settledAt: "2026-05-01T18:00:00.000Z", payments: [], items: [] }]
    });
    insertApiDailySnapshot(database, { id: "api-day-open", businessDate: "2026-05-02", finalSalesPaise: 0, status: "active" });

    const summaryResponse = await app.inject({ method: "GET", url: "/reports/range?from=2026-05-01&to=2026-05-03", headers });
    const billsResponse = await app.inject({ method: "GET", url: "/reports/range?from=2026-05-01&to=2026-05-03&includeBills=true", headers });
    const invalidResponse = await app.inject({ method: "GET", url: "/reports/range?from=2026-05-03&to=2026-05-01", headers });

    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json()).toMatchObject({
      finalSalesPaise: 10_000,
      availableDays: [expect.objectContaining({ business_date: "2026-05-01" })],
      unfinalizedDates: ["2026-05-02"],
      missingDates: ["2026-05-03"]
    });
    expect(summaryResponse.json()).not.toHaveProperty("billSummaries");
    expect(billsResponse.json()).toMatchObject({ billSummaries: [expect.objectContaining({ billId: "bill-1" })] });
    expect(invalidResponse.statusCode).toBe(400);

    await app.close();
    database.close();
  });

  it("creates and changes master PIN before editing paid history bills through owner approval", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: { tableId: "table-t1", pax: 1, orderType: "dine_in", printMode: "kot", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const billResponse = await app.inject({ method: "POST", url: `/bills/${order.orderId}/generate`, headers });
    const bill = billResponse.json<{ billId: string; totalPaise: number }>();
    await app.inject({ method: "POST", url: `/bills/${bill.billId}/settle`, headers, payload: { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain" } });

    const initialStatus = await app.inject({ method: "GET", url: "/settings/master-pin/status", headers });
    const created = await app.inject({
      method: "PUT",
      url: "/settings/master-pin",
      headers,
      payload: { newPin: "9876", confirmPin: "9876", updatedBy: "owner" }
    });
    const missingCurrentChange = await app.inject({
      method: "PUT",
      url: "/settings/master-pin",
      headers,
      payload: { newPin: "1111", confirmPin: "1111", updatedBy: "owner" }
    });
    const changed = await app.inject({
      method: "PUT",
      url: "/settings/master-pin",
      headers,
      payload: { currentPin: "9876", newPin: "1111", confirmPin: "1111", updatedBy: "owner" }
    });
    const badEdit = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/history-edit`,
      headers,
      payload: {
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
        payments: [{ method: "cash", amountPaise: 36_000 }],
        masterApproval: { pin: "1234", reason: "Owner history edit", approvedBy: "owner" }
      }
    });
    const edited = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/history-edit`,
      headers,
      payload: {
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }],
        payments: [
          { method: "upi", amountPaise: 20_000, reference: "UPI-edited" },
          { method: "card", amountPaise: 16_000, reference: "UPI-edited" }
        ],
        masterApproval: { pin: "1111", reason: "Owner history edit", approvedBy: "owner" }
      }
    });

    expect(initialStatus.json()).toEqual({ masterPinConfigured: false });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ configured: true });
    expect(missingCurrentChange.statusCode).toBe(403);
    expect(changed.statusCode).toBe(200);
    expect(badEdit.statusCode).toBe(403);
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      billId: bill.billId,
      revisionNumber: 2,
      totalPaise: 36_000,
      printJobId: expect.any(String),
      modified: true,
      processed: { printed: 1, failed: 0, skipped: 0 }
    });
    expect(database.db.prepare("SELECT method, amount_paise, reference FROM payments WHERE bill_id = ? ORDER BY method").all(bill.billId)).toEqual([
      { method: "card", amount_paise: 16_000, reference: "UPI-edited" },
      { method: "upi", amount_paise: 20_000, reference: "UPI-edited" }
    ]);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE type = 'bill.history_edited'").get()).toEqual({ count: 1 });

    await app.close();
    database.close();
  });

  it("stores order notes on KDS tickets created by a KOT send", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 2,
        orderType: "dine_in",
        printMode: "kot",
        note: "Less spicy, serve together",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });

    const kdsResponse = await app.inject({
      method: "GET",
      url: "/kds/unit-kitchen",
      headers
    });
    const [ticket] = kdsResponse.json<Array<{ note: string; items: Array<{ name_snapshot: string }> }>>();

    expect(kdsResponse.statusCode).toBe(200);
    expect(ticket).toMatchObject({ note: "Less spicy, serve together" });
    expect(ticket?.items[0]).toMatchObject({ name_snapshot: "Dal Fry" });

    await app.close();
    database.close();
  });

  it("stores item notes on KDS tickets created by a KOT send", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 2,
        orderType: "dine_in",
        printMode: "kot",
        items: [{ menuItemId: "item-dal-fry", quantity: 1, note: "No onion" }]
      }
    });

    const kdsResponse = await app.inject({
      method: "GET",
      url: "/kds/unit-kitchen",
      headers
    });
    const [ticket] = kdsResponse.json<Array<{ items: Array<{ name_snapshot: string; note_snapshot: string | null }> }>>();

    expect(kdsResponse.statusCode).toBe(200);
    expect(ticket?.items[0]).toMatchObject({ name_snapshot: "Dal Fry", note_snapshot: "No onion" });

    await app.close();
    database.close();
  });

  it("saves order state without KDS for save and with KDS for save_print", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers,
      payload: { tableId: "table-t1", pax: 1, orderType: "dine_in", printMode: "kot", items: [{ menuItemId: "item-dal-fry", quantity: 1 }] }
    });
    const order = orderResponse.json<{ orderId: string }>();

    const saveResponse = await app.inject({
      method: "POST",
      url: `/orders/${order.orderId}/state`,
      headers,
      payload: { saveMode: "save", items: [{ menuItemId: "item-dal-fry", quantity: 2 }] }
    });
    const printResponse = await app.inject({
      method: "POST",
      url: `/orders/${order.orderId}/state`,
      headers,
      payload: { saveMode: "save_print", items: [{ menuItemId: "item-dal-fry", quantity: 3 }] }
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toMatchObject({ kotIds: [], printJobIds: [] });
    expect(printResponse.statusCode).toBe(200);
    expect(printResponse.json()).toMatchObject({ kotIds: [expect.any(String)], processed: { printed: 1, failed: 0, skipped: 0 } });
    expect(database.db.prepare("SELECT quantity FROM order_items WHERE order_id = ?").get(order.orderId)).toEqual({ quantity: 3 });

    await app.close();
    database.close();
  });
});
