import { expect, it } from "vitest";
import type { HubBootstrap } from "../lib/hub-client";
import { tableElapsed } from "../lib/table-presentation";
const table = { status: "occupied", current_order_id: "o", occupied_at: "2026-11-04T10:00:00Z" } as HubBootstrap["tables"][number];
it("uses live running time and freezes billed time at its actual event", () => {
  const now = Date.parse("2026-11-04T11:25:00Z");
  expect(tableElapsed(table, now)).toBe("1h 25m");
  expect(tableElapsed({ ...table, status: "billed", timer_ended_at: "2026-11-04T10:38:00Z" }, now)).toBe("38m");
});
it("does not invent timing for free, older or invalid hub data", () => {
  expect(tableElapsed({ ...table, status: "free", current_order_id: null })).toBeNull();
  expect(tableElapsed({ ...table, occupied_at: undefined })).toBeNull();
  expect(tableElapsed({ ...table, occupied_at: "invalid" })).toBeNull();
});
