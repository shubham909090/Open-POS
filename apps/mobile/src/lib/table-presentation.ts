import { getTableDisplayState } from "@gaurav-pos/shared";
import type { HubBootstrap } from "./hub-client";

/** Billed timers stop at the bill event; older hubs can omit timing entirely. */
export function tableElapsed(table: HubBootstrap["tables"][number], now = Date.now()): string | null {
  if (!table.occupied_at || getTableDisplayState(table) === "free") return null;
  const start = Date.parse(table.occupied_at);
  if (!Number.isFinite(start)) return null;
  const end = getTableDisplayState(table) === "bill_printed" && table.timer_ended_at ? Date.parse(table.timer_ended_at) : now;
  if (!Number.isFinite(end)) return null;
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
