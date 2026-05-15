import { describe, expect, it } from "vitest";
import { businessDayWindowForDate, currentBusinessDayWindow, getBusinessDateForInstant } from "../domain/business-day.js";

describe("6 AM IST business day window", () => {
  it("keeps orders before 6 AM IST in the previous business date", () => {
    expect(getBusinessDateForInstant(new Date("2026-05-15T00:29:59.000Z"))).toBe("2026-05-14");
    expect(currentBusinessDayWindow(new Date("2026-05-15T00:29:59.000Z"))).toMatchObject({
      id: "day-2026-05-14",
      businessDate: "2026-05-14"
    });
  });

  it("starts the new business date exactly at 6 AM IST", () => {
    expect(getBusinessDateForInstant(new Date("2026-05-15T00:30:00.000Z"))).toBe("2026-05-15");
    expect(currentBusinessDayWindow(new Date("2026-05-15T00:30:00.000Z"))).toEqual({
      id: "day-2026-05-15",
      businessDate: "2026-05-15",
      periodStartAt: "2026-05-15T00:30:00.000Z",
      periodEndAt: "2026-05-16T00:30:00.000Z"
    });
  });

  it("builds fixed 24-hour windows from 6 AM IST to 6 AM IST", () => {
    expect(businessDayWindowForDate("2026-05-15")).toEqual({
      id: "day-2026-05-15",
      businessDate: "2026-05-15",
      periodStartAt: "2026-05-15T00:30:00.000Z",
      periodEndAt: "2026-05-16T00:30:00.000Z"
    });
  });
});
