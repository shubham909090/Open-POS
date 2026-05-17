import { afterEach, describe, expect, it, vi } from "vitest";
import { HubClient, buildRealtimeUrl, getLocalOnlyHubUrlMessage, getPairingFailureAlert, HubHttpError } from "../lib/hub-client";

describe("HubClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends the local device token to protected hub routes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          currentBusinessDay: {
            id: "day-2026-05-09",
            business_date: "2026-05-09",
            period_start_at: "2026-05-09T00:30:00.000Z",
            period_end_at: "2026-05-10T00:30:00.000Z",
            status: "active"
          },
          tables: [],
          productionUnits: [],
          menuItems: [],
          syncStatus: { counts: {} }
        }),
        { status: 200 }
      )
    );

    const client = new HubClient("http://hub.local:3737", "device-token");
    await client.bootstrap();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.local:3737/sync/bootstrap",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-device-token": "device-token" })
      })
    );
  });

  it("builds authenticated realtime websocket URLs from the hub URL", () => {
    expect(buildRealtimeUrl("http://192.168.1.20:3737", "device token")).toBe(
      "ws://192.168.1.20:3737/realtime?token=device%20token"
    );
    expect(buildRealtimeUrl("https://pos.example.test/hub/", "secret")).toBe(
      "wss://pos.example.test/realtime?token=secret"
    );
  });

  it("ignores malformed saved realtime URLs instead of crashing the app", () => {
    vi.stubGlobal(
      "WebSocket",
      class {
        close() {}
      }
    );
    const client = new HubClient("not a valid url", "device-token");

    expect(() => client.subscribeRealtime(vi.fn())).not.toThrow();
  });

  it("subscribes to realtime events, ignores bad frames, reconnects, and cleans up", async () => {
    vi.useFakeTimers();
    class MockWebSocket {
      static instances: MockWebSocket[] = [];
      onmessage: ((message: { data: string }) => void) | null = null;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;

      constructor(readonly url: string) {
        MockWebSocket.instances.push(this);
      }

      close() {
        this.closed = true;
        this.onclose?.();
      }

      emitMessage(data: string) {
        this.onmessage?.({ data });
      }

      emitClose() {
        this.onclose?.();
      }
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    const onEvent = vi.fn();
    const client = new HubClient("http://hub.local:3737", "device-token");

    const unsubscribe = client.subscribeRealtime(onEvent);
    expect(MockWebSocket.instances[0]?.url).toBe("ws://hub.local:3737/realtime?token=device-token");

    MockWebSocket.instances[0]?.emitMessage(JSON.stringify({ type: "order.submitted" }));
    MockWebSocket.instances[0]?.emitMessage("{not-json");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "order.submitted" });

    MockWebSocket.instances[0]?.emitClose();
    await vi.advanceTimersByTimeAsync(1_499);
    expect(MockWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]?.emitClose();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(MockWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    unsubscribe();
    MockWebSocket.instances[2]?.emitClose();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(MockWebSocket.instances).toHaveLength(3);
    expect(MockWebSocket.instances[2]?.closed).toBe(true);
  });

  it("exchanges pairing codes through the public pairing endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deviceId: "device-1", deviceName: "Phone", role: "waiter", token: "hub_token" }), {
        status: 200
      })
    );

    const client = new HubClient("http://hub.local:3737", "");
    const result = await client.exchangePairingCode({ code: "123456", deviceName: "Phone" });

    expect(result.token).toBe("hub_token");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.local:3737/devices/pair/exchange",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("explains local-only pairing URLs before Android tries to connect to itself", () => {
    expect(getLocalOnlyHubUrlMessage("http://127.0.0.1:3737")).toContain("http://127.0.0.1:3737");
    expect(getLocalOnlyHubUrlMessage("http://localhost:3737")).toContain("localhost");
    expect(getLocalOnlyHubUrlMessage("http://[::1]:3737")).toContain("[::1]");
    expect(getLocalOnlyHubUrlMessage("http://192.168.1.20:3737")).toBeNull();
  });

  it("keeps server-side pairing errors distinct from network reachability errors", () => {
    const expired = getPairingFailureAlert("http://192.168.1.20:3737", new HubHttpError("Pairing code has expired", 401));
    const network = getPairingFailureAlert("http://192.168.1.20:3737", new TypeError("Network request failed"));

    expect(expired).toEqual({ title: "Pairing failed", message: "Pairing code has expired" });
    expect(network.title).toBe("Hub not reachable");
    expect(network.message).toContain("http://192.168.1.20:3737");
  });

  it("sends an idempotency key with order submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ orderId: "order-1", kotIds: ["kot-1"] }), { status: 200 })
    );

    const client = new HubClient("http://hub.local:3737", "captain-token");
    await client.submitOrder({
      tableId: "table-1",
      captainId: "Captain",
      pax: 2,
      orderType: "dine_in",
      printMode: "kot",
      items: [{ menuItemId: "item-1", quantity: 1 }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.local:3737/orders/submit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-device-token": "captain-token",
          "Idempotency-Key": expect.stringMatching(/^mobile-order-/)
        }),
        body: expect.stringContaining('"printMode":"kot"')
      })
    );
  });

  it("reuses caller-provided idempotency keys for one logical action", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ billId: "bill-1", status: "paid", remainingPaise: 0 }), { status: 200 })
    );

    const client = new HubClient("http://hub.local:3737", "captain-token");
    const actionKey = "mobile-bill-settle-action-1";
    const payload = {
      discountType: "amount" as const,
      discountValue: 0,
      tipPaise: 0,
      payments: [{ method: "cash" as const, amountPaise: 5000 }]
    };

    await client.settleBill("bill-1", payload, { idempotencyKey: actionKey });
    await client.settleBill("bill-1", payload, { idempotencyKey: actionKey });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://hub.local:3737/bills/bill-1/settle",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": actionKey })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://hub.local:3737/bills/bill-1/settle",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": actionKey })
      })
    );
  });

  it("moves selected order items and reads ready notifications", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ fromOrderId: "order-1", toOrderId: "order-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "ready-1", tableName: "T1", productionUnitName: "Kitchen", items: [] }]), { status: 200 }));

    const client = new HubClient("http://hub.local:3737", "captain-token");
    await client.moveItems({
      fromTableId: "table-1",
      toTableId: "table-2",
      reason: "Split table",
      items: [{ orderItemId: "item-1", quantity: 1 }]
    });
    const notifications = await client.readyNotifications();

    expect(notifications).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://hub.local:3737/orders/items/move",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://hub.local:3737/notifications/ready",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-device-token": "captain-token" })
      })
    );
  });

  it("sends full order-state updates with caller-selected save mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ orderId: "order-1", status: "open", totalPaise: 37800, kotIds: [], printJobIds: [] }), { status: 200 })
    );

    const client = new HubClient("http://hub.local:3737", "captain-token");
    await client.updateOrderState(
      "order-1",
      { saveMode: "save", items: [{ menuItemId: "item-1", quantity: 2 }] },
      { idempotencyKey: "state-once" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.local:3737/orders/order-1/state",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "state-once" }),
        body: JSON.stringify({ saveMode: "save", items: [{ menuItemId: "item-1", quantity: 2 }] })
      })
    );
  });

  it("loads older order history days and detail reports", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{ pos_day_id: "day-1", business_date: "2026-05-16", bill_count: 2 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pos_day_id: "day-1", business_date: "2026-05-16", billSummaries: [{ billId: "bill-1", billNumber: 1, subtotalPaise: 10000, taxPaise: 500, totalPaise: 10500, finalTotalPaise: 10500, paidPaise: 10500, payments: [], items: [] }] }), { status: 200 }));

    const client = new HubClient("http://hub.local:3737", "captain-token");
    const reports = await client.dailyReports();
    const detail = await client.dailyReport("day-1");

    expect(reports[0]?.business_date).toBe("2026-05-16");
    expect(detail.billSummaries[0]).toMatchObject({ billNumber: 1, subtotalPaise: 10000, taxPaise: 500 });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://hub.local:3737/reports/daily",
      expect.objectContaining({ headers: expect.objectContaining({ "x-device-token": "captain-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://hub.local:3737/reports/daily/day-1",
      expect.objectContaining({ headers: expect.objectContaining({ "x-device-token": "captain-token" }) })
    );
  });

  it("loads kitchen tickets and updates KOT status for kitchen devices", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "kot-1", table_name: "T1", status: "queued", items: [] }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "kot-1", status: "ready" }), { status: 200 }));

    const client = new HubClient("http://hub.local:3737", "kitchen-token");
    const tickets = await client.kds("unit-kitchen");
    await client.updateKotStatus("kot-1", "ready");

    expect(tickets).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://hub.local:3737/kds/unit-kitchen",
      expect.objectContaining({ headers: expect.objectContaining({ "x-device-token": "kitchen-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://hub.local:3737/kot/kot-1/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "ready" })
      })
    );
  });

  it("uses captain billing routes with idempotency keys and manager approval payloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ billId: "bill-1", totalPaise: 12100 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ printJobId: "print-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ printJobId: "print-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ printJobId: "history-print" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ billId: "bill-1", revisionNumber: 2, totalPaise: 36000, printJobId: "history-edit", modified: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ billId: "bill-1", revisionNumber: 2, totalPaise: 24200, kotIds: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ printJobId: "print-nc" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ billId: "bill-1", status: "paid", remainingPaise: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ billCount: 1, finalSalesPaise: 24200 }), { status: 200 }));

    const client = new HubClient("http://hub.local:3737", "captain-token");
    const approval = { managerApproval: { pin: "1234", reason: "Customer copy", approvedBy: "Manager" } };

    await client.generateBill("order-1", { idempotencyKey: "generate-once" });
    await client.printBill("bill-1", { idempotencyKey: "print-once" });
    await client.reprintBill("bill-1", approval, { idempotencyKey: "reprint-once" });
    await client.historyReprintBill("bill-1", { idempotencyKey: "history-reprint-once" });
    await client.historyEditBill(
      "bill-1",
      {
        masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" },
        items: [{ orderItemId: "order-item-1", menuItemId: "item-1", quantity: 2 }]
      },
      { idempotencyKey: "history-edit-once" }
    );
    await client.reviseBill("bill-1", { ...approval, items: [{ menuItemId: "item-1", quantity: 2 }] }, { idempotencyKey: "revise-once" });
    await client.markBillNc("bill-1", approval, { idempotencyKey: "nc-once" });
    await client.settleBill(
      "bill-1",
      {
        discountType: "amount",
        discountValue: 0,
        tipPaise: 0,
        payments: [{ method: "upi", amountPaise: 24200, reference: "captain note" }]
      },
      { idempotencyKey: "settle-once" }
    );
    await client.currentBusinessDaySummary();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://hub.local:3737/bills/order-1/generate",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "generate-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://hub.local:3737/bills/bill-1/print",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "print-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://hub.local:3737/bills/bill-1/reprint",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "reprint-once" }),
        body: JSON.stringify({ reason: "Customer copy", ...approval })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://hub.local:3737/bills/bill-1/history-reprint",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "history-reprint-once" }),
        body: JSON.stringify({})
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://hub.local:3737/bills/bill-1/history-edit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "history-edit-once" }),
        body: JSON.stringify({
          masterApproval: { pin: "9876", reason: "Owner history edit", approvedBy: "owner" },
          items: [{ orderItemId: "order-item-1", menuItemId: "item-1", quantity: 2 }]
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "http://hub.local:3737/bills/bill-1/revise",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "revise-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "http://hub.local:3737/bills/bill-1/nc",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "nc-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "http://hub.local:3737/bills/bill-1/settle",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "settle-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "http://hub.local:3737/business-day/current-summary",
      expect.objectContaining({ headers: expect.objectContaining({ "x-device-token": "captain-token" }) })
    );
  });
});
