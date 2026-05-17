import { afterEach, describe, expect, it, vi } from "vitest";
import { connectHubRealtime, getRealtimeInvalidationKeys } from "../renderer/realtime.js";

describe("hub realtime invalidation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes table truth when order, bill, or table events arrive", () => {
    expect(getRealtimeInvalidationKeys({ type: "order.submitted" })).toEqual([
      ["bootstrap"],
      ["tableOrder"],
      ["kds"],
      ["currentBusinessDaySummary"],
      ["alcohol"]
    ]);
    expect(getRealtimeInvalidationKeys({ type: "bill.settled" })).toEqual([
      ["bootstrap"],
      ["tableOrder"],
      ["currentBusinessDaySummary"],
      ["dailyReports"],
      ["alcohol"],
      ["alcoholStockMovements"]
    ]);
	    expect(getRealtimeInvalidationKeys({ type: "bill.reprinted" })).toEqual([
	      ["bootstrap"],
	      ["tableOrder"],
	      ["currentBusinessDaySummary"]
	    ]);
	    expect(getRealtimeInvalidationKeys({ type: "order_state.updated" })).toEqual([
	      ["bootstrap"],
	      ["tableOrder"],
	      ["kds"],
	      ["currentBusinessDaySummary"],
	      ["alcohol"]
	    ]);
    expect(getRealtimeInvalidationKeys({ type: "table.shifted" })).toEqual([
      ["bootstrap"],
      ["tableOrder"],
      ["kds"]
    ]);
  });

  it("refreshes kitchen tickets when KOT status changes", () => {
    expect(getRealtimeInvalidationKeys({ type: "kot.status_changed" })).toEqual([
      ["kds"],
      ["bootstrap"]
    ]);
  });

  it("connects with the hub token, ignores bad frames, reconnects, and stops on cleanup", async () => {
    vi.useFakeTimers();
    class MockWebSocket {
      static instances: MockWebSocket[] = [];
      onmessage: ((message: { data: string }) => void) | null = null;
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
    vi.stubGlobal("window", { location: { protocol: "https:", host: "hub.example.test" } });
    const onEvent = vi.fn();
    const onDisconnect = vi.fn();

    const cleanup = connectHubRealtime({ token: "device token", onEvent, onDisconnect });

    expect(MockWebSocket.instances[0]?.url).toBe("wss://hub.example.test/realtime?token=device%20token");
    MockWebSocket.instances[0]?.emitMessage(JSON.stringify({ type: "bill.settled" }));
    MockWebSocket.instances[0]?.emitMessage("not-json");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "bill.settled" });

    MockWebSocket.instances[0]?.emitClose();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(MockWebSocket.instances).toHaveLength(2);

    cleanup();
    MockWebSocket.instances[1]?.emitClose();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]?.closed).toBe(true);
  });
});
