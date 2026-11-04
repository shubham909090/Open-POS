import { describe, expect, it } from "vitest";
import { kitchenItemPresentation, kitchenTicketPresentation } from "../components/kitchen-ticket-presentation";

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
    expect(kitchenItemPresentation(3)).toEqual({ quantity: "+3×", action: "Add", kind: "add" });
    expect(kitchenItemPresentation(0, "No chillies")).toEqual({ quantity: "Note", action: "Updated", kind: "note" });
    expect(kitchenItemPresentation(0, null)).toEqual({ quantity: "Note", action: "Cleared", kind: "note" });
    expect(kitchenTicketPresentation()).toEqual({ label: "Kitchen ticket", cancellation: false });
  });
});
