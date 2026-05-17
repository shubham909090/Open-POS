import { beforeEach, describe, expect, it, vi } from "vitest";

describe("hub renderer API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "captain-token"),
      setItem: vi.fn()
    });
  });

  it("reuses caller-provided idempotency keys for one logical action", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ orderId: "order-1", kotIds: ["kot-1"] }), { status: 200 })
    );
    const { hubApi } = await import("../renderer/hub-api.js");

    await hubApi.submitOrder(
      {
        tableId: "table-1",
        pax: 2,
        printMode: "kot",
        items: [{ menuItemId: "item-1", quantity: 1 }]
      },
      "hub-submit-action-1"
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(JSON.parse(String(init.body))).toMatchObject({ printMode: "kot" });
    expect(headers.get("idempotency-key")).toBe("hub-submit-action-1");
    expect(headers.get("authorization")).toBe("Bearer captain-token");
  });

  it("can force-refresh PC printer discovery instead of using the cached list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const { hubApi } = await import("../renderer/hub-api.js");

    await hubApi.systemPrinters({ refresh: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/system-printers?refresh=1",
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );
  });
});
