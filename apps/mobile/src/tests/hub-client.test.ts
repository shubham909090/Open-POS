import { afterEach, describe, expect, it, vi } from "vitest";
import { HubClient } from "../lib/hub-client";

describe("HubClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the local device token to protected hub routes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ openDay: null, tables: [], productionUnits: [], menuItems: [], syncStatus: { counts: {} } }), {
        status: 200
      })
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
});
