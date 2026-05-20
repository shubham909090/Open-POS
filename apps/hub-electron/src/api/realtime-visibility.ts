import type { UserRole } from "@gaurav-pos/shared";

export function isRealtimeEventVisibleForRole(event: unknown, role: UserRole): boolean {
  if (role === "admin" || role === "captain") return true;
  const type = typeof event === "object" && event !== null && "type" in event ? String((event as { type?: unknown }).type ?? "") : "";
  const kdsChangingEvents = ["order.submitted", "order.cancelled", "order_items.cancelled", "table.shifted", "order_items.shifted"];
  if (role === "kitchen") {
    if (type === "order_state.updated") return Boolean((event as { result?: { kdsChanged?: unknown } }).result?.kdsChanged);
    return type.startsWith("kot.") || kdsChangingEvents.includes(type);
  }
  if (role === "waiter") {
    return [
      "order.submitted",
      "order.cancelled",
      "order_items.cancelled",
      "order_state.updated",
      "table.shifted",
      "order_items.shifted",
      "kot.status_changed",
      "bill.generated",
      "bill.printed",
      "bill.reprinted",
      "bill.history_reprinted",
      "bill.revised",
      "bill.settled",
      "bill.nc_marked"
    ].includes(type);
  }
  return false;
}

export function realtimeEventForRole(event: unknown, role: UserRole): unknown | null {
  if (!isRealtimeEventVisibleForRole(event, role)) return null;
  if (event === null || typeof event !== "object" || !("type" in event)) return event;
  const type = String((event as { type?: unknown }).type ?? "");
  if (role === "kitchen" && !type.startsWith("kot.")) return { type, result: { kdsChanged: true } };
  if (role !== "waiter") return event;
  if (type.startsWith("bill.")) return { type, result: { tableStatusChanged: true } };
  return event;
}
