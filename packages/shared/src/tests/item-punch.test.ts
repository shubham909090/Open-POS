import { describe, expect, it } from "vitest";
import { formatItemPunch, formatPosDateTime } from "../datetime.js";

describe("sent item punching details", () => {
  it("formats food and bar tickets and distinguishes transfer tickets", () => {
    const time = "2026-09-10T10:00:00Z";
    expect(formatItemPunch({ kot_sequence: 42, kot_created_at: time, kot_ticket_label: "BOT" })).toBe(`BOT #42 · ${formatPosDateTime(time)}`);
    expect(formatItemPunch({ kot_sequence: 42, kot_created_at: time, kot_type: "table_shifted" })).toBe(`KOT #42 (transfer) · ${formatPosDateTime(time)}`);
  });
  it("does not invent details for older hubs or items without a ticket", () => {
    expect(formatItemPunch()).toBeUndefined();
    expect(formatItemPunch({ kot_sequence: null, kot_created_at: null })).toBeUndefined();
  });
});
