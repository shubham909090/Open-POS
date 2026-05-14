import { describe, expect, it } from "vitest";
import { createHubServer, isRealtimeEventVisibleForRole } from "../api/server.js";
import { BackupService } from "../db/backup-service.js";
import { EventBus } from "../domain/event-bus.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { createTestHub } from "./helpers.js";

function createTestServer() {
  const hub = createTestHub();
  const printJobService = new PrintJobService(hub.database.orm, new DryRunPrinterAdapter());
  const app = createHubServer({
    database: hub.database,
    backupService: new BackupService(hub.database, ":memory:", "./data/test-backups"),
    authService: hub.authService,
    orderService: hub.orderService,
    printJobService,
    eventBus: new EventBus<unknown>(),
    printerDryRun: true
  });

  return { ...hub, app };
}

describe("Hub API auth and service flow", () => {
  it("requires a local device token for protected routes", async () => {
    const { app, database } = createTestServer();

    const unauthorized = await app.inject({ method: "GET", url: "/sync/bootstrap" });
    const authorized = await app.inject({
      method: "GET",
      url: "/sync/bootstrap",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json<{ setup: { printerDryRun: boolean } }>().setup.printerDryRun).toBe(true);

    await app.close();
    database.close();
  });

  it("pairs a waiter device and enforces role permissions", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };

    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: { deviceName: "Waiter phone", role: "waiter", expiresInMinutes: 10 }
    });
    const pairing = pairingResponse.json<{
      code: string;
      qrDataUrl: string;
      pairingPayload: { kind: string; hubUrl: string; code: string; role: string };
      pairingPayloadText: string;
    }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Waiter phone" }
    });
    const device = exchangeResponse.json<{ token: string }>();
    const meResponse = await app.inject({
      method: "GET",
      url: "/devices/me",
      headers: { "x-device-token": device.token }
    });

    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: { "x-device-token": device.token },
      payload: {
        tableId: "table-t1",
        captainId: "spoofed-waiter",
        pax: 2,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const orderRow = database.db.prepare("SELECT captain_id, created_by_role FROM orders WHERE id = ?").get(order.orderId);
    const settleResponse = await app.inject({
      method: "POST",
      url: "/bills/not-real/settle",
      headers: { "x-device-token": device.token },
      payload: { method: "cash", amountPaise: 1, receivedBy: "cashier-1" }
    });
    await app.inject({
      method: "POST",
      url: `/bills/${order.orderId}/generate`,
      headers: adminHeaders
    });
    const waiterTableOrderResponse = await app.inject({
      method: "GET",
      url: "/tables/table-t1/order",
      headers: { "x-device-token": device.token }
    });
    const waiterBootstrapResponse = await app.inject({
      method: "GET",
      url: "/sync/bootstrap",
      headers: { "x-device-token": device.token }
    });
    const waiterTableOrder = waiterTableOrderResponse.json<Record<string, unknown>>();
    const waiterBootstrap = waiterBootstrapResponse.json<Record<string, unknown>>();

    expect(pairing.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(pairing.pairingPayload).toMatchObject({
      kind: "gaurav-pos-pairing",
      code: pairing.code,
      role: "waiter"
    });
    expect(JSON.parse(pairing.pairingPayloadText).hubUrl).toContain("localhost");
    expect(exchangeResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({ name: "Waiter phone", role: "waiter" });
    expect(orderResponse.statusCode).toBe(200);
    expect(orderRow).toEqual({ captain_id: "Waiter phone", created_by_role: "waiter" });
    expect(settleResponse.statusCode).toBe(403);
    expect(waiterTableOrderResponse.statusCode).toBe(200);
    expect(waiterTableOrder.bill).toBeNull();
    expect(waiterTableOrder).not.toHaveProperty("payments");
    expect(waiterTableOrder).not.toHaveProperty("kots");
    expect(waiterBootstrap).not.toHaveProperty("syncStatus");
    expect(waiterBootstrap).not.toHaveProperty("printJobs");
    expect(waiterBootstrap).not.toHaveProperty("ticketTemplate");

    await app.close();
    database.close();
  });

  it("filters realtime event visibility by device role", () => {
    expect(isRealtimeEventVisibleForRole({ type: "bill.settled" }, "cashier")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "bill.settled" }, "captain")).toBe(false);
    expect(isRealtimeEventVisibleForRole({ type: "receipt_printer.updated" }, "kitchen")).toBe(false);
    expect(isRealtimeEventVisibleForRole({ type: "kot.status_changed" }, "kitchen")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "table.shifted" }, "waiter")).toBe(true);
  });

  it("lets captains shift only their own running tables and items", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };

    async function pair(role: "captain" | "waiter", name: string) {
      const pairingResponse = await app.inject({
        method: "POST",
        url: "/devices/pairing-codes",
        headers: adminHeaders,
        payload: { deviceName: name, role, expiresInMinutes: 10 }
      });
      const pairing = pairingResponse.json<{ code: string }>();
      const exchangeResponse = await app.inject({
        method: "POST",
        url: "/devices/pair/exchange",
        payload: { code: pairing.code, deviceName: name }
      });
      return exchangeResponse.json<{ token: string }>();
    }

    const captainOne = await pair("captain", "Captain One");
    const captainTwo = await pair("captain", "Captain Two");
    const waiter = await pair("waiter", "Waiter One");

    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: { "x-device-token": captainOne.token },
      payload: {
        tableId: "table-t1",
        captainId: "spoofed-name",
        pax: 2,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 2 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const orderRow = database.db.prepare("SELECT captain_id, captain_device_id FROM orders WHERE id = ?").get(order.orderId) as {
      captain_id: string;
      captain_device_id: string;
    };

    const waiterMove = await app.inject({
      method: "POST",
      url: "/tables/move",
      headers: { "x-device-token": waiter.token },
      payload: { fromTableId: "table-t1", toTableId: "table-t2", reason: "Should fail" }
    });
    const otherCaptainMove = await app.inject({
      method: "POST",
      url: "/tables/move",
      headers: { "x-device-token": captainTwo.token },
      payload: { fromTableId: "table-t1", toTableId: "table-t2", reason: "Wrong owner" }
    });
    const ownMove = await app.inject({
      method: "POST",
      url: "/tables/move",
      headers: { "x-device-token": captainOne.token },
      payload: { fromTableId: "table-t1", toTableId: "table-t2", reason: "Guest moved" }
    });
    const item = database.db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.orderId) as { id: string };
    const ownItemMove = await app.inject({
      method: "POST",
      url: "/orders/items/move",
      headers: { "x-device-token": captainOne.token },
      payload: { fromTableId: "table-t2", toTableId: "table-t1", reason: "Split table", items: [{ orderItemId: item.id, quantity: 1 }] }
    });

    expect(orderRow.captain_id).toBe("Captain One");
    expect(orderRow.captain_device_id).toMatch(/^device_/);
    expect(waiterMove.statusCode).toBe(403);
    expect(otherCaptainMove.statusCode).toBe(403);
    expect(ownMove.statusCode).toBe(200);
    expect(ownItemMove.statusCode).toBe(200);

    await app.close();
    database.close();
  });

  it("keeps kitchen devices limited to KDS actions instead of full order reads", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };

    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: { deviceName: "Kitchen screen", role: "kitchen", expiresInMinutes: 10 }
    });
    const pairing = pairingResponse.json<{ code: string }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Kitchen screen" }
    });
    const kitchen = exchangeResponse.json<{ token: string }>();
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: adminHeaders,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 2,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();

    const tableOrderResponse = await app.inject({
      method: "GET",
      url: "/tables/table-t1/order",
      headers: { "x-device-token": kitchen.token }
    });
    const fullOrderResponse = await app.inject({
      method: "GET",
      url: `/orders/${order.orderId}`,
      headers: { "x-device-token": kitchen.token }
    });
    const kdsResponse = await app.inject({
      method: "GET",
      url: "/kds/unit-kitchen",
      headers: { "x-device-token": kitchen.token }
    });

    expect(tableOrderResponse.statusCode).toBe(403);
    expect(fullOrderResponse.statusCode).toBe(403);
    expect(kdsResponse.statusCode).toBe(200);

    await app.close();
    database.close();
  });

  it("configures receipt printer and processes bill print in dry-run", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

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
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const billResponse = await app.inject({
      method: "POST",
      url: `/bills/${order.orderId}/generate`,
      headers
    });
    const bill = billResponse.json<{ billId: string; totalPaise: number }>();
    await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/settle`,
      headers,
      payload: { method: "cash", amountPaise: bill.totalPaise, receivedBy: "cashier-1" }
    });
    const printResponse = await app.inject({
      method: "POST",
      url: "/print-jobs/process",
      headers
    });

    expect(billResponse.statusCode).toBe(200);
    expect(printResponse.json()).toEqual({ printed: 2, failed: 0 });
    expect(database.db.prepare("SELECT status FROM print_jobs WHERE target_id = ?").get(bill.billId)).toEqual({
      status: "printed"
    });

    await app.close();
    database.close();
  });

  it("allows cashier stock edits with manager PIN and exposes alcohol movement reports", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: { deviceName: "Cashier tablet", role: "cashier", expiresInMinutes: 10 }
    });
    const pairing = pairingResponse.json<{ code: string }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Cashier tablet" }
    });
    const cashier = exchangeResponse.json<{ token: string }>();
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: adminHeaders,
      payload: { newPin: "1234", updatedBy: "admin" }
    });
    const alcoholResponse = await app.inject({
      method: "POST",
      url: "/alcohol/items",
      headers: adminHeaders,
      payload: {
        type: "plain_liquor",
        name: "Cashier Whisky",
        productionUnitId: "unit-bar",
        largeBottleMl: 750,
        smallBottleMl: 180,
        sealedLargeCount: 0,
        openLargeMl: 0,
        sealedSmallCount: 0,
        variants: [{ label: "30 ml", kind: "shot", pricePaise: 10_000, volumeMl: 30, inventoryAction: "large_ml", sortOrder: 0, active: true }],
        recipeIngredients: []
      }
    });
    const alcohol = alcoholResponse.json<{ id: string }>();

    const adjustResponse = await app.inject({
      method: "POST",
      url: `/alcohol/stock/${alcohol.id}/adjust`,
      headers: { "x-device-token": cashier.token },
      payload: {
        mode: "delta",
        sealedLargeCount: 2,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      }
    });
    const movementsResponse = await app.inject({
      method: "GET",
      url: "/reports/alcohol-stock-movements",
      headers: { "x-device-token": cashier.token }
    });

    expect(adjustResponse.statusCode).toBe(200);
    expect(movementsResponse.statusCode).toBe(200);
    expect(movementsResponse.json<Array<{ item_name: string; source_type: string }>>()[0]).toMatchObject({
      item_name: "Cashier Whisky",
      source_type: "manual_adjustment"
    });

    await app.close();
    database.close();
  });

  it("reprints a generated bill and exposes current business-day summary after settlement", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };
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
      headers,
      payload: {
        tableId: "table-t1",
        captainId: "waiter-1",
        pax: 1,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    const billResponse = await app.inject({ method: "POST", url: `/bills/${order.orderId}/generate`, headers });
    const bill = billResponse.json<{ billId: string; totalPaise: number }>();

    const reprintResponse = await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/reprint`,
      headers,
      payload: {
        reason: "Customer copy",
        requestedBy: "cashier-1",
        managerApproval: { pin: "1234", reason: "Customer copy", approvedBy: "manager" }
      }
    });
    await app.inject({
      method: "POST",
      url: `/bills/${bill.billId}/settle`,
      headers,
      payload: { method: "cash", amountPaise: bill.totalPaise, receivedBy: "cashier-1" }
    });
    const summaryResponse = await app.inject({
      method: "GET",
      url: "/business-day/current-summary",
      headers
    });

    expect(reprintResponse.statusCode).toBe(200);
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

    expect(second.json()).toEqual(first.json());
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM orders").get()).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM kots").get()).toEqual({ count: 1 });

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
});
