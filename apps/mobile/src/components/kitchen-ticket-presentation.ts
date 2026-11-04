import type { KotType } from "@gaurav-pos/shared";

const ticketLabels: Record<KotType, string> = {
  new: "New order",
  modified: "Modified order",
  partial_cancel: "Items cancelled",
  cancelled: "Order cancelled",
  table_shifted: "Table moved",
  reprint: "Reprint",
};

export function kitchenTicketPresentation(type?: KotType) {
  return {
    label: type ? ticketLabels[type] : "Kitchen ticket",
    cancellation: type === "cancelled" || type === "partial_cancel",
  };
}

/** KDS quantities are changes to an existing order, never unsigned portions. */
export function kitchenItemPresentation(quantityDelta: number, note?: string | null) {
  if (quantityDelta < 0) return { quantity: `−${Math.abs(quantityDelta)}×`, action: "Remove", kind: "remove" as const };
  if (quantityDelta === 0) return { quantity: "Note", action: note ? "Updated" : "Cleared", kind: "note" as const };
  return { quantity: `+${quantityDelta}×`, action: "Add", kind: "add" as const };
}
