import { describe, expect, it } from "vitest";
import { kitchenItemPresentation, kitchenTicketAge, kitchenTicketPresentation } from "../components/kitchen-ticket-presentation";

describe("kitchen change instructions", () => {
  it("distinguishes cancellations from new cooking instructions", () => {
    expect(kitchenTicketPresentation("new")).toEqual({ label: "New order", cancellation: false });
    expect(kitchenTicketPresentation("modified")).toEqual({ label: "Modified order", cancellation: false });
    for (const type of ["partial_cancel", "cancelled"] as const) {
      expect(kitchenTicketPresentation(type).cancellation).toBe(true);
      expect(kitchenItemPresentation(-2)).toEqual({ quantity: "−2×", action: "Remove", kind: "remove" });
    }
  });

  it("keeps additions signed and note-only changes explicitly non-quantity instructions", () => {
    expect(kitchenItemPresentation(3, null, "new").quantity).toBe("3×");
    expect(kitchenItemPresentation(3)).toEqual({ quantity: "+3×", action: "Add", kind: "add" });
    expect(kitchenItemPresentation(0, "No chillies")).toEqual({ quantity: "Note", action: "Updated", kind: "note" });
    expect(kitchenItemPresentation(0, null)).toEqual({ quantity: "Note", action: "Cleared", kind: "note" });
    expect(kitchenTicketPresentation()).toEqual({ label: "Kitchen ticket", cancellation: false });
  });
});

it("formats optional kitchen ages compactly and omits invalid timestamps", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  expect(kitchenTicketAge(undefined, now)).toBeNull();
  expect(kitchenTicketAge("invalid", now)).toBeNull();
  expect(kitchenTicketAge("2026-11-04T11:57:00Z", now)).toBe("3m ago");
  expect(kitchenTicketAge("2026-11-04T09:00:00Z", now)).toBe("3h ago");
  expect(kitchenTicketAge("2026-11-02T12:00:00Z", now)).toBe("2d ago");
});
