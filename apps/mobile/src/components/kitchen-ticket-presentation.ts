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

/** New tickets show portions; modifications retain their signed deltas. */
export function kitchenItemPresentation(quantityDelta: number, note?: string | null, type?: KotType) {
  if (quantityDelta < 0) return { quantity: `−${Math.abs(quantityDelta)}×`, action: "Remove", kind: "remove" as const };
  if (quantityDelta === 0) return { quantity: "Note", action: note ? "Updated" : "Cleared", kind: "note" as const };
  return { quantity: `${type === "new" ? "" : "+"}${quantityDelta}×`, action: "Add", kind: "add" as const };
}

/** Cancellation and note-only notices do not ask the cook to prepare dishes. */
export function kitchenTicketNeedsAcknowledgment(type: KotType | undefined, items: ReadonlyArray<{ quantity_delta: number }>) {
  return type === "cancelled" || type === "partial_cancel" || items.every((item) => item.quantity_delta <= 0);
}

/** Compact elapsed time, tolerant of older hubs that omit timestamps. */
export function kitchenTicketAge(createdAt?: string, now = Date.now()): string | null {
  if (!createdAt) return null;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return null;
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
