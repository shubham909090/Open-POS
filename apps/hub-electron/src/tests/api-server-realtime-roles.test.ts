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

describe("Hub API realtime and role routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters realtime event visibility by device role", () => {
    expect(isRealtimeEventVisibleForRole({ type: "bill.settled" }, "captain")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "bill.settled" }, "waiter")).toBe(true);
    expect(realtimeEventForRole({ type: "bill.settled", result: { paidPaise: 1000 } }, "waiter")).toEqual({
      type: "bill.settled",
      result: { tableStatusChanged: true }
    });
    expect(isRealtimeEventVisibleForRole({ type: "receipt_printer.updated" }, "kitchen")).toBe(false);
    expect(isRealtimeEventVisibleForRole({ type: "kot.status_changed" }, "kitchen")).toBe(true);
    expect(realtimeEventForRole({ type: "order.submitted", result: { orderId: "order-1", kotIds: ["kot-1"] } }, "kitchen")).toEqual({
      type: "order.submitted",
      result: { kdsChanged: true }
    });
    expect(isRealtimeEventVisibleForRole({ type: "order_items.cancelled" }, "kitchen")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "table.shifted" }, "waiter")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "order.cancelled" }, "waiter")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "order_items.cancelled" }, "waiter")).toBe(true);
  });

  it("streams role-filtered realtime messages over real websocket connections", async () => {
    const { app, database } = createTestServer();
    await setTestManagerPin(app);
    const kitchen = await pairTestDevice(app, "kitchen", "Kitchen socket");
    const waiter = await pairTestDevice(app, "waiter", "Waiter socket");
    const websocketBaseUrl = await listenForWebSockets(app);
    const kitchenSocket = new WebSocket(`${websocketBaseUrl}/realtime?token=${encodeURIComponent(kitchen.token)}`);
    const waiterSocket = new WebSocket(`${websocketBaseUrl}/realtime?token=${encodeURIComponent(waiter.token)}`);

    try {
      await Promise.all([waitForSocketOpen(kitchenSocket), waitForSocketOpen(waiterSocket)]);
      const kitchenSubmitted = waitForSocketMessage<{ type: string; result: Record<string, unknown> }>(
        kitchenSocket,
        (message) => message.type === "order.submitted"
      );
      const orderResponse = await app.inject({
        method: "POST",
        url: "/orders/submit",
        headers: { "x-device-token": "test-admin-token" },
        payload: {
          tableId: "table-t1",
          captainId: "waiter-1",
          pax: 2,
          orderType: "dine_in",
          printMode: "kot",
          items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
        }
      });
      const order = orderResponse.json<{ orderId: string }>();

      expect(await kitchenSubmitted).toEqual({ type: "order.submitted", result: { kdsChanged: true } });

      const waiterCancelled = waitForSocketMessage<{ type: string; result: Record<string, unknown> }>(
        waiterSocket,
        (message) => message.type === "order.cancelled"
      );
      const kitchenCancelled = waitForSocketMessage<{ type: string; result: Record<string, unknown> }>(
        kitchenSocket,
        (message) => message.type === "order.cancelled"
      );
      const cancelResponse = await app.inject({
        method: "POST",
        url: `/orders/${order.orderId}/cancel`,
        headers: { "x-device-token": "test-admin-token" },
        payload: { reason: "Void order", managerApproval: { ...testManagerApproval, reason: "Cancel order" } }
      });
      expect(cancelResponse.statusCode).toBe(200);

      const [kitchenCancelEvent, waiterCancelEvent] = await Promise.all([kitchenCancelled, waiterCancelled]);
      expect(kitchenCancelEvent).toEqual({ type: "order.cancelled", result: { kdsChanged: true } });
      expect(waiterCancelEvent).toMatchObject({ type: "order.cancelled", result: { orderId: order.orderId } });
    } finally {
      kitchenSocket.terminate();
      waiterSocket.terminate();
      await app.close();
      database.close();
    }
  });

  it("accepts realtime auth through websocket subprotocol tokens", async () => {
    const { app, database } = createTestServer();
    await setTestManagerPin(app);
    const kitchen = await pairTestDevice(app, "kitchen", "Kitchen protocol socket");
    const websocketBaseUrl = await listenForWebSockets(app);
    const kitchenSocket = new WebSocket(`${websocketBaseUrl}/realtime`, [`pos-token.${kitchen.token}`]);

    try {
      await waitForSocketOpen(kitchenSocket);
      const submitted = waitForSocketMessage<{ type: string; result: Record<string, unknown> }>(
        kitchenSocket,
        (message) => message.type === "order.submitted"
      );
      const orderResponse = await app.inject({
        method: "POST",
        url: "/orders/submit",
        headers: { "x-device-token": "test-admin-token" },
        payload: {
          tableId: "table-t1",
          pax: 2,
          orderType: "dine_in",
          printMode: "kot",
          items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
        }
      });

      expect(orderResponse.statusCode).toBe(200);
      expect(await submitted).toEqual({ type: "order.submitted", result: { kdsChanged: true } });
    } finally {
      kitchenSocket.terminate();
      await app.close();
      database.close();
    }
  });

  it("closes realtime sockets with invalid device tokens", async () => {
    const { app, database } = createTestServer();
    const websocketBaseUrl = await listenForWebSockets(app);
    const socket = new WebSocket(`${websocketBaseUrl}/realtime?token=not-a-real-token`);

    try {
      await waitForSocketOpen(socket);
      await waitForSocketClose(socket);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
      socket.terminate();
      await app.close();
      database.close();
    }
  });

  it("does not leak bill realtime events to kitchen sockets", async () => {
    const { app, database } = createTestServer();
    await setTestManagerPin(app);
    const kitchen = await pairTestDevice(app, "kitchen", "Kitchen no bill socket");
    const waiter = await pairTestDevice(app, "waiter", "Waiter bill socket");
    const websocketBaseUrl = await listenForWebSockets(app);
    const kitchenSocket = new WebSocket(`${websocketBaseUrl}/realtime?token=${encodeURIComponent(kitchen.token)}`);
    const waiterSocket = new WebSocket(`${websocketBaseUrl}/realtime?token=${encodeURIComponent(waiter.token)}`);

    try {
      await Promise.all([waitForSocketOpen(kitchenSocket), waitForSocketOpen(waiterSocket)]);
      const submitted = waitForSocketMessage<{ type: string; result: Record<string, unknown> }>(
        kitchenSocket,
        (message) => message.type === "order.submitted"
      );
      const orderResponse = await app.inject({
        method: "POST",
        url: "/orders/submit",
        headers: { "x-device-token": "test-admin-token" },
        payload: {
          tableId: "table-t1",
          captainId: "waiter-1",
          pax: 2,
          orderType: "dine_in",
          printMode: "kot",
          items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
        }
      });
      const order = orderResponse.json<{ orderId: string }>();
      await submitted;

      const waiterBill = waitForSocketMessage<{ type: string; result: Record<string, unknown> }>(
        waiterSocket,
        (message) => message.type === "bill.generated"
      );
      const kitchenBillLeak = expectNoSocketMessage<{ type: string }>(kitchenSocket, (message) => message.type === "bill.generated");
      const billResponse = await app.inject({
        method: "POST",
        url: `/bills/${order.orderId}/generate`,
        headers: { "x-device-token": "test-admin-token" }
      });

      expect(billResponse.statusCode).toBe(200);
      expect(await waiterBill).toEqual({ type: "bill.generated", result: { tableStatusChanged: true } });
      await kitchenBillLeak;
    } finally {
      kitchenSocket.terminate();
      waiterSocket.terminate();
      await app.close();
      database.close();
    }
  });

  it("lets captains shift any running table and selected items", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);

    async function pair(role: "captain" | "waiter", name: string) {
      const pairingResponse = await app.inject({
        method: "POST",
        url: "/devices/pairing-codes",
        headers: adminHeaders,
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
      payload: { fromTableId: "table-t1", toTableId: "table-t2", reason: "Guest moved" }
    });
    const item = database.db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.orderId) as { id: string };
    const otherCaptainItemMove = await app.inject({
      method: "POST",
      url: "/orders/items/move",
      headers: { "x-device-token": captainTwo.token },
      payload: { fromTableId: "table-t2", toTableId: "table-t1", reason: "Split table", items: [{ orderItemId: item.id, quantity: 1 }] }
    });
    const captainKdsStatus = await app.inject({
      method: "PATCH",
      url: "/kot/not-real/status",
      headers: { "x-device-token": captainOne.token },
      payload: { status: "ready" }
    });

    expect(orderRow.captain_id).toBe("Captain One");
    expect(orderRow.captain_device_id).toMatch(/^device_/);
    expect(waiterMove.statusCode).toBe(403);
    expect(otherCaptainMove.statusCode).toBe(200);
    expect(otherCaptainItemMove.statusCode).toBe(200);
    expect(captainKdsStatus.statusCode).toBe(403);

    await app.close();
    database.close();
  });

  it("keeps billed-table movement admin-only", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);
    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Captain Billing Move", "captain")
    });
    const captainResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairingResponse.json<{ code: string }>().code, deviceName: "Captain Billing Move" }
    });
    const captainHeaders = { "x-device-token": captainResponse.json<{ token: string }>().token };
    const orderResponse = await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: captainHeaders,
      payload: {
        tableId: "table-t1",
        pax: 2,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const order = orderResponse.json<{ orderId: string }>();
    await app.inject({ method: "POST", url: `/bills/${order.orderId}/generate`, headers: captainHeaders });

    const captainMove = await app.inject({
      method: "POST",
      url: "/tables/move",
      headers: captainHeaders,
      payload: { fromTableId: "table-t1", toTableId: "table-t2", reason: "After bill print" }
    });
    const adminMove = await app.inject({
      method: "POST",
      url: "/tables/move",
      headers: adminHeaders,
      payload: { fromTableId: "table-t1", toTableId: "table-t2", reason: "Manager correction" }
    });

    expect(captainMove.statusCode).toBe(403);
    expect(captainMove.json()).toMatchObject({ error: "Captains can shift only running tables before billing" });
    expect(adminMove.statusCode).toBe(200);

    await app.close();
    database.close();
  });

  it("keeps kitchen devices limited to KDS actions instead of full order reads", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);

    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Kitchen screen", "kitchen")
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

  it("delivers kitchen ready notifications once to the order-taking device that owns the table", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);

    async function pair(role: "captain" | "waiter" | "kitchen", name: string) {
      const pairingResponse = await app.inject({
        method: "POST",
        url: "/devices/pairing-codes",
        headers: adminHeaders,
        payload: pairingPayload(name, role)
      });
      const exchangeResponse = await app.inject({
        method: "POST",
        url: "/devices/pair/exchange",
        payload: { code: pairingResponse.json<{ code: string }>().code, deviceName: name }
      });
      return exchangeResponse.json<{ token: string }>();
    }

    const captain = await pair("captain", "Captain Ready");
    const waiter = await pair("waiter", "Waiter Ready");
    const kitchen = await pair("kitchen", "Kitchen Ready");
    await app.inject({
      method: "POST",
      url: "/orders/submit",
      headers: { "x-device-token": waiter.token },
      payload: {
        tableId: "table-t1",
        pax: 2,
        orderType: "dine_in",
        items: [{ menuItemId: "item-dal-fry", quantity: 1 }]
      }
    });
    const kdsResponse = await app.inject({
      method: "GET",
      url: "/kds/unit-kitchen",
      headers: { "x-device-token": kitchen.token }
    });
    const [ticket] = kdsResponse.json<Array<{ id: string }>>();
    if (!ticket) throw new Error("Expected a kitchen ticket for the submitted order");

    const statusResponse = await app.inject({
      method: "PATCH",
      url: `/kot/${ticket.id}/status`,
      headers: { "x-device-token": kitchen.token },
      payload: { status: "ready" }
    });
    const captainNotifications = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": captain.token }
    });
    const waiterNotifications = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": waiter.token }
    });
    const waiterNotificationsAgain = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": waiter.token }
    });
    const captainNotificationsAgain = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": captain.token }
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(waiterNotifications.statusCode).toBe(200);
    expect(captainNotifications.statusCode).toBe(200);
    expect(captainNotifications.json()).toEqual([]);
    expect(waiterNotifications.json()).toEqual([
      expect.objectContaining({
        kotId: ticket.id,
        tableName: "T1",
        productionUnitName: "Kitchen",
        items: [{ name: "Dal Fry", quantity: 1 }]
      })
    ]);
    expect(waiterNotificationsAgain.json()).toEqual([]);
    expect(captainNotificationsAgain.json()).toEqual([]);

    await app.close();
    database.close();
  });

  it("lets admins switch printer mode and queue test prints", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);
    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Waiter phone", "waiter")
    });
    const waiter = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairingResponse.json<{ code: string }>().code, deviceName: "Waiter phone" }
    });
    const waiterHeaders = { "x-device-token": waiter.json<{ token: string }>().token };

    const blocked = await app.inject({
      method: "PUT",
      url: "/settings/printer-mode",
      headers: waiterHeaders,
      payload: { mode: "live" }
    });
    const live = await app.inject({
      method: "PUT",
      url: "/settings/printer-mode",
      headers: adminHeaders,
      payload: { mode: "live" }
    });
    const mode = await app.inject({
      method: "GET",
      url: "/settings/printer-mode",
      headers: adminHeaders
    });
    const test = await app.inject({
      method: "PUT",
      url: "/settings/printer-mode",
      headers: adminHeaders,
      payload: { mode: "test" }
    });
    const testBill = await app.inject({
      method: "POST",
      url: "/print-jobs/test-bill",
      headers: adminHeaders
    });
    const testKot = await app.inject({
      method: "POST",
      url: "/print-jobs/test-kot",
      headers: adminHeaders
    });

    expect(blocked.statusCode).toBe(403);
    expect(live.json()).toEqual({ mode: "live" });
    expect(mode.json()).toEqual({ mode: "live" });
    expect(test.json()).toEqual({ mode: "test" });
    expect(testBill.statusCode).toBe(200);
    expect(testKot.statusCode).toBe(200);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_id IN ('test-bill', 'test-kot') AND status = 'printed'").get()).toEqual({ count: 2 });

    await app.close();
    database.close();
  });
});
