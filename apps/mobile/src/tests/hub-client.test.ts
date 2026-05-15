import { afterEach, describe, expect, it, vi } from "vitest";
import { HubClient } from "../lib/hub-client";

describe("HubClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
      items: [{ menuItemId: "item-1", quantity: 1 }]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hub.local:3737/orders/submit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-device-token": "captain-token",
          "Idempotency-Key": expect.stringMatching(/^mobile-order-/)
        })
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ billId: "bill-1", revisionNumber: 2, totalPaise: 24200, kotIds: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ printJobId: "print-nc" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ billId: "bill-1", status: "paid", remainingPaise: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ billCount: 1, finalSalesPaise: 24200 }), { status: 200 }));

    const client = new HubClient("http://hub.local:3737", "captain-token");
    const approval = { managerApproval: { pin: "1234", reason: "Customer copy", approvedBy: "Manager" } };

    await client.generateBill("order-1", { idempotencyKey: "generate-once" });
    await client.printBill("bill-1", { idempotencyKey: "print-once" });
    await client.reprintBill("bill-1", approval, { idempotencyKey: "reprint-once" });
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
      "http://hub.local:3737/bills/bill-1/revise",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "revise-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://hub.local:3737/bills/bill-1/nc",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "nc-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "http://hub.local:3737/bills/bill-1/settle",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "settle-once" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "http://hub.local:3737/business-day/current-summary",
      expect.objectContaining({ headers: expect.objectContaining({ "x-device-token": "captain-token" }) })
    );
  });
});
