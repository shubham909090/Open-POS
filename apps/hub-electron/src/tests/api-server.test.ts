import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHubServer, isRealtimeEventVisibleForRole } from "../api/server.js";
import type { FastifyInstance } from "fastify";
import { BackupService } from "../db/backup-service.js";
import { HubDatabase } from "../db/database.js";
import { cloudCommandFailures, idempotencyRecords } from "../db/drizzle-schema.js";
import { AuthService } from "../domain/auth-service.js";
import { EventBus } from "../domain/event-bus.js";
import { OrderService } from "../domain/order-service.js";
import { DryRunPrinterAdapter } from "../printing/escpos.js";
import { PrintJobService } from "../printing/print-job-service.js";
import { ConvexSyncBridge } from "../sync/convex-sync.js";
import { createTestHub } from "./helpers.js";

function createTestServer(options: { requestRestart?: () => void } = {}) {
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
    requestRestart: options.requestRestart
  });

  return { ...hub, app };
}

function createFileBackedTestServer(root: string, options: { requestRestart?: () => void } = {}) {
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

const testManagerApproval = { pin: "1234", reason: "Pair device", approvedBy: "manager" };

async function setTestManagerPin(app: FastifyInstance, pin = "1234") {
  await app.inject({
    method: "PUT",
    url: "/settings/manager-pin",
    payload: { newPin: pin, updatedBy: "owner" }
  });
}

function pairingPayload(deviceName: string, role: "admin" | "captain" | "waiter" | "kitchen") {
  return { deviceName, role, expiresInMinutes: 10, managerApproval: testManagerApproval };
}

describe("Hub API auth and service flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
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
    expect(authorized.json<{ setup: { printerOutputMode: "test" | "live" } }>().setup.printerOutputMode).toBe("test");

    await app.close();
    database.close();
  });

  it("lets a fresh hub create a Manager PIN and unlock setup without hub.env admin token", async () => {
    const { app, database } = createTestServer();

    const statusBefore = await app.inject({ method: "GET", url: "/admin/session/status" });
    const remoteCreatePin = await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      remoteAddress: "192.168.1.44",
      payload: { newPin: "9999", updatedBy: "remote" }
    });
    const createPin = await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const unlock = await app.inject({
      method: "POST",
      url: "/admin/session/unlock",
      payload: { pin: "4321" }
    });
    const token = unlock.json<{ token: string }>().token;
    const bootstrap = await app.inject({
      method: "GET",
      url: "/sync/bootstrap",
      headers: { "x-device-token": token }
    });

    expect(statusBefore.json()).toEqual({ managerPinConfigured: false });
    expect(remoteCreatePin.statusCode).toBe(403);
    expect(remoteCreatePin.json()).toEqual({ error: "Create the first Manager PIN from the hub PC." });
    expect(createPin.statusCode).toBe(200);
    expect(unlock.statusCode).toBe(200);
    expect(token).toMatch(/^hub_admin_/);
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json<{ setup: { managerPinConfigured: boolean } }>().setup.managerPinConfigured).toBe(true);

    await app.close();
    database.close();
  });

  it("locks the local admin session by invalidating the issued token", async () => {
    const { app, database } = createTestServer();

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const unlock = await app.inject({
      method: "POST",
      url: "/admin/session/unlock",
      payload: { pin: "4321" }
    });
    const token = unlock.json<{ token: string }>().token;
    const beforeLock = await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": token } });
    const lock = await app.inject({ method: "POST", url: "/admin/session/lock", headers: { "x-device-token": token }, payload: {} });
    const afterLock = await app.inject({ method: "GET", url: "/sync/bootstrap", headers: { "x-device-token": token } });

    expect(beforeLock.statusCode).toBe(200);
    expect(lock.statusCode).toBe(200);
    expect(afterLock.statusCode).toBe(401);

    await app.close();
    database.close();
  });

  it("schedules a manager-approved full reset and restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "gaurav-pos-api-reset-"));
    const requestRestart = vi.fn();
    const { app, database, databasePath } = createFileBackedTestServer(root, { requestRestart });

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "4321", updatedBy: "owner" }
    });
    const reset = await app.inject({
      method: "POST",
      url: "/system/full-reset",
      headers: { "x-device-token": "test-admin-token" },
      payload: {
        confirmationText: "RESET HUB",
        includeBackups: false,
        managerApproval: { pin: "4321", reason: "Full reset hub", approvedBy: "manager" }
      }
    });

    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ scheduled: true, restartRequired: true, includeBackups: false });
    expect(existsSync(join(root, "backups", "reset-pending.json"))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requestRestart).toHaveBeenCalledTimes(1);

    await app.close();
    database.close();
    BackupService.applyPendingReset(databasePath, join(root, "backups"));
    expect(existsSync(databasePath)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("saves masked hub cloud settings behind Manager PIN and tests cloud connectivity", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token", "x-manager-pin": "1234" };
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "1234", updatedBy: "admin" }
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ inserted: 0 }), { status: 200 }));

    const save = await app.inject({
      method: "PUT",
      url: "/settings/hub-connection",
      headers,
      payload: {
        cloudUrl: "https://example.convex.site",
        installationId: "install-main",
        syncSecret: "secret-main",
        hubPublicUrl: "http://192.168.1.20:3737"
      }
    });
    const masked = await app.inject({ method: "GET", url: "/settings/hub-connection", headers: { "x-device-token": "test-admin-token" } });
    const revealed = await app.inject({ method: "GET", url: "/settings/hub-connection?reveal=1", headers });
    const test = await app.inject({ method: "POST", url: "/settings/hub-connection/test", headers, payload: {} });

    expect(save.statusCode).toBe(200);
    expect(masked.json()).toMatchObject({ configured: true, syncSecret: "••••••••••••" });
    expect(revealed.json()).toMatchObject({ syncSecret: "secret-main" });
    expect(test.json()).toMatchObject({ status: "connected" });
    expect(fetchSpy).toHaveBeenCalledWith("https://example.convex.site/pos/ingest-events", expect.any(Object));

    await app.close();
    database.close();
  });

  it("pairs a waiter device and enforces role permissions", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);

    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Waiter phone", "waiter")
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
      payload: { method: "cash", amountPaise: 1, receivedBy: "captain-1" }
    });
    await app.inject({
      method: "POST",
      url: `/bills/${order.orderId}/generate`,
      headers: adminHeaders
    });
    const waiterFullOrderResponse = await app.inject({
      method: "GET",
      url: `/orders/${order.orderId}`,
      headers: { "x-device-token": device.token }
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
    const waiterFullOrder = waiterFullOrderResponse.json<Record<string, unknown>>();
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
    expect(waiterFullOrderResponse.statusCode).toBe(200);
    expect(waiterFullOrder.bill).toBeNull();
    expect(waiterFullOrder).not.toHaveProperty("payments");
    expect(waiterFullOrder).not.toHaveProperty("kots");
    expect(waiterBootstrap).not.toHaveProperty("syncStatus");
    expect(waiterBootstrap).not.toHaveProperty("printJobs");
    expect(waiterBootstrap).not.toHaveProperty("ticketTemplate");

    await app.close();
    database.close();
  });

  it("requires Manager PIN approval before creating device pairing QR codes", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      payload: { newPin: "4321", updatedBy: "owner" }
    });

    const withoutApproval = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: { deviceName: "Waiter phone", role: "waiter", expiresInMinutes: 10 }
    });
    const withApproval = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: {
        deviceName: "Waiter phone",
        role: "waiter",
        expiresInMinutes: 10,
        managerApproval: { pin: "4321", reason: "Pair captain phone", approvedBy: "owner" }
      }
    });

    expect(withoutApproval.statusCode).toBe(403);
    expect(withApproval.statusCode).toBe(200);
    expect(withApproval.json<{ pairingPayload: { role: string } }>().pairingPayload.role).toBe("waiter");

    await app.close();
    database.close();
  });

  it("requeues failed sync outbox rows from the admin endpoint", async () => {
    const { app, database } = createTestServer();
    database.db
      .prepare("INSERT INTO event_log (event_id, type, aggregate_type, aggregate_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("event-requeue-1", "test.event", "test", "test-1", "{}", new Date().toISOString());
    database.db
      .prepare("INSERT INTO sync_outbox (event_id, status, attempts, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("event-requeue-1", "failed", 10, "old outage", new Date().toISOString(), new Date().toISOString());

    const response = await app.inject({
      method: "POST",
      url: "/sync/requeue-failed",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ requeued: 1 });
    expect(database.db.prepare("SELECT status, attempts, last_error FROM sync_outbox").get()).toEqual({
      status: "pending",
      attempts: 0,
      last_error: null
    });

    await app.close();
    database.close();
  });

  it("lets admins mark cloud command failures resolved", async () => {
    const { app, database } = createTestServer();
    database.orm
      .insert(cloudCommandFailures)
      .values({
        commandId: "cmd-bad-menu",
        type: "menu_item.upsert",
        payloadJson: "{}",
        error: "Menu item id is required",
        failedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      })
      .run();

    const response = await app.inject({
      method: "DELETE",
      url: "/sync/cloud-command-failures/cmd-bad-menu",
      headers: { "x-device-token": "test-admin-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ commandId: "cmd-bad-menu", resolved: true });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM cloud_command_failures").get()).toEqual({ count: 0 });

    await app.close();
    database.close();
  });

  it("throttles repeated invalid pairing code exchanges", async () => {
    const { app, database } = createTestServer();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/devices/pair/exchange",
        payload: { code: "000000", deviceName: "Unknown phone" }
      });
      expect(response.statusCode).toBe(401);
    }
    const locked = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: "000000", deviceName: "Unknown phone" }
    });

    expect(locked.statusCode).toBe(429);

    await app.close();
    database.close();
  });

  it("filters realtime event visibility by device role", () => {
    expect(isRealtimeEventVisibleForRole({ type: "bill.settled" }, "captain")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "bill.settled" }, "waiter")).toBe(false);
    expect(isRealtimeEventVisibleForRole({ type: "receipt_printer.updated" }, "kitchen")).toBe(false);
    expect(isRealtimeEventVisibleForRole({ type: "kot.status_changed" }, "kitchen")).toBe(true);
    expect(isRealtimeEventVisibleForRole({ type: "table.shifted" }, "waiter")).toBe(true);
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

  it("delivers kitchen ready notifications once to the captain that owns the table", async () => {
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
      headers: { "x-device-token": captain.token },
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
    const waiterNotifications = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": waiter.token }
    });
    const captainNotifications = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": captain.token }
    });
    const captainNotificationsAgain = await app.inject({
      method: "GET",
      url: "/notifications/ready",
      headers: { "x-device-token": captain.token }
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(waiterNotifications.statusCode).toBe(200);
    expect(waiterNotifications.json()).toEqual([]);
    expect(captainNotifications.statusCode).toBe(200);
    expect(captainNotifications.json()).toEqual([
      expect.objectContaining({
        kotId: ticket.id,
        tableName: "T1",
        productionUnitName: "Kitchen",
        items: [{ name: "Dal Fry", quantity: 1 }]
      })
    ]);
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

  it("applies cash-counter and kitchen-specific print layouts to test tickets", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token", "x-manager-pin": "1234" };
    await app.inject({
      method: "PUT",
      url: "/settings/manager-pin",
      headers: { "x-device-token": "test-admin-token" },
      payload: { newPin: "1234", updatedBy: "admin" }
    });

    const receiptLayout = await app.inject({
      method: "PUT",
      url: "/print-layouts/receipt",
      headers,
      payload: {
        scope: "receipt",
        restaurantName: "Sky Bistro",
        billHeader: "TAX INVOICE",
        billFooter: "Thank you",
        kotHeader: "",
        kotFooter: "",
        taxRegistrationText: "GSTIN TEST",
        lineWidthChars: 32,
        headerAlign: "left",
        footerAlign: "center",
        feedLines: 2,
        showTable: false,
        showCaptain: true,
        showDateTime: true,
        showBillId: true,
        showTaxBreakup: true,
        showPaymentSplit: true,
        showDiscountTip: true,
        showNcReprintRevision: true
      }
    });
    const unitLayout = await app.inject({
      method: "PUT",
      url: "/print-layouts/unit",
      headers,
      payload: {
        scope: "unit",
        productionUnitId: "unit-bar",
        restaurantName: "",
        billHeader: "",
        billFooter: "",
        kotHeader: "HOT KITCHEN",
        kotFooter: "Cook fast",
        taxRegistrationText: "",
        lineWidthChars: 32,
        headerAlign: "left",
        footerAlign: "left",
        feedLines: 2,
        showTable: true,
        showCaptain: false,
        showDateTime: false,
        showBillId: true,
        showTaxBreakup: true,
        showPaymentSplit: true,
        showDiscountTip: true,
        showNcReprintRevision: true
      }
    });
    await app.inject({ method: "POST", url: "/print-jobs/test-bill", headers: { "x-device-token": "test-admin-token" } });
    await app.inject({ method: "POST", url: "/print-jobs/test-kot", headers: { "x-device-token": "test-admin-token" } });

    const billPayload = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = 'test-bill' ORDER BY created_at DESC LIMIT 1").get() as { payload: string };
    const kotPayload = database.db.prepare("SELECT payload FROM print_jobs WHERE target_id = 'test-kot' ORDER BY created_at DESC LIMIT 1").get() as { payload: string };
    expect(receiptLayout.statusCode).toBe(200);
    expect(unitLayout.statusCode).toBe(200);
    expect(billPayload.payload).toContain("Sky Bistro");
    expect(billPayload.payload).toContain("TAX INVOICE");
    expect(billPayload.payload).not.toContain("Table: TEST");
    expect(kotPayload.payload).toContain("HOT KITCHEN");
    expect(kotPayload.payload).not.toContain("Captain:");

    await app.close();
    database.close();
  });

  it("configures receipt printer and processes bill print in test mode", async () => {
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
      payload: { method: "cash", amountPaise: bill.totalPaise, receivedBy: "captain-1" }
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

  it("allows captain stock edits with manager PIN and exposes alcohol movement reports", async () => {
    const { app, database } = createTestServer();
    const adminHeaders = { "x-device-token": "test-admin-token" };
    await setTestManagerPin(app);
    const pairingResponse = await app.inject({
      method: "POST",
      url: "/devices/pairing-codes",
      headers: adminHeaders,
      payload: pairingPayload("Captain tablet", "captain")
    });
    const pairing = pairingResponse.json<{ code: string }>();
    const exchangeResponse = await app.inject({
      method: "POST",
      url: "/devices/pair/exchange",
      payload: { code: pairing.code, deviceName: "Captain tablet" }
    });
    const captain = exchangeResponse.json<{ token: string }>();
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
        name: "Captain Whisky",
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
      headers: { "x-device-token": captain.token },
      payload: {
        mode: "delta",
        sealedLargeCount: 2,
        managerApproval: { pin: "1234", reason: "Alcohol stock edit", approvedBy: "manager" }
      }
    });
    const movementsResponse = await app.inject({
      method: "GET",
      url: "/reports/alcohol-stock-movements",
      headers: { "x-device-token": captain.token }
    });

    expect(adjustResponse.statusCode).toBe(200);
    expect(movementsResponse.statusCode).toBe(200);
    expect(movementsResponse.json<Array<{ item_name: string; source_type: string }>>()[0]).toMatchObject({
      item_name: "Captain Whisky",
      source_type: "manual_adjustment"
    });

    await app.close();
    database.close();
  });

  it("imports normal dishes from CSV and reports bad rows", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/menu-items/import-csv",
      headers,
      payload: {
        csv: [
          "name,price,kitchen_or_counter,sale_category,active",
          "Veg Fried Rice,180,Kitchen,Food,true",
          "Bad Free Item,0,Kitchen,Food,true"
        ].join("\n")
      }
    });
    const catalogResponse = await app.inject({ method: "GET", url: "/menu-items?includeInactive=1", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      created: 1,
      failed: 1,
      errors: [{ row: 3 }]
    });
    expect(catalogResponse.json<Array<{ name: string; price_paise: number; production_unit_name: string; sale_group_name: string }>>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Veg Fried Rice",
          price_paise: 18_000,
          production_unit_name: "Kitchen",
          sale_group_name: "Food"
        })
      ])
    );

    await app.close();
    database.close();
  });

  it("imports plain liquor stock from CSV", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    const response = await app.inject({
      method: "POST",
      url: "/alcohol/items/import-csv",
      headers,
      payload: {
        type: "plain_liquor",
        csv: [
          "name,bar_counter,large_bottle_ml,small_bottle_ml,sealed_large_count,open_large_ml,sealed_small_count,shot_price,small_bottle_price,large_bottle_price,active",
          "Imported Whisky,Bar,750,180,6,120,3,40,250,900,true"
        ].join("\n")
      }
    });
    const catalogResponse = await app.inject({ method: "GET", url: "/alcohol", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ created: 1, failed: 0 });
    expect(catalogResponse.json<{ items: Array<{ name: string; type: string; sealed_large_count: number; open_large_ml: number; sealed_small_count: number; variants: Array<{ label: string; price_paise: number }> }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Imported Whisky",
          type: "plain_liquor",
          sealed_large_count: 6,
          open_large_ml: 120,
          sealed_small_count: 3,
          variants: expect.arrayContaining([
            expect.objectContaining({ label: "30 ml", price_paise: 4_000 }),
            expect.objectContaining({ label: "180 ml", price_paise: 25_000 }),
            expect.objectContaining({ label: "750 ml", price_paise: 90_000 })
          ])
        })
      ])
    );

    await app.close();
    database.close();
  });

  it("imports prepared alcohol products with recipe references", async () => {
    const { app, database } = createTestServer();
    const headers = { "x-device-token": "test-admin-token" };

    await app.inject({
      method: "POST",
      url: "/alcohol/items/import-csv",
      headers,
      payload: {
        type: "plain_liquor",
        csv: "name,bar_counter,shot_price\nImported Vodka,Bar,60"
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/alcohol/items/import-csv",
      headers,
      payload: {
        type: "prepared_product",
        csv: "name,bar_counter,price,recipe,active\nImported Cocktail,Bar,350,Imported Vodka:60,true"
      }
    });
    const catalogResponse = await app.inject({ method: "GET", url: "/alcohol", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ created: 1, failed: 0 });
    expect(catalogResponse.json<{ items: Array<{ name: string; type: string; variants: Array<{ label: string; price_paise: number }>; recipeIngredients: Array<{ liquor_name: string; ml_per_unit: number }> }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Imported Cocktail",
          type: "prepared_product",
          variants: expect.arrayContaining([expect.objectContaining({ label: "Regular", price_paise: 35_000 })]),
          recipeIngredients: expect.arrayContaining([expect.objectContaining({ liquor_name: "Imported Vodka", ml_per_unit: 60 })])
        })
      ])
    );

    await app.close();
    database.close();
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
    await app.inject({
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

    expect(firstPrintResponse.statusCode).toBe(200);
    expect(repeatedPrintResponse.statusCode).toBe(400);
    expect(repeatedPrintResponse.json()).toMatchObject({ error: "Bill was already printed. Use manager-approved reprint." });
    expect(reprintResponse.statusCode).toBe(200);
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json()).toMatchObject({ paidBills: 1, unpaidBills: 0 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM print_jobs WHERE target_type = 'BILL'").get()).toEqual({
      count: 3
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
