import { getTableDisplayState } from "@gaurav-pos/shared";
import type { HubBootstrap } from "./hub-client";

/** Running tables show time occupied; billed tables show time waiting for payment. */
export function tableElapsed(table: HubBootstrap["tables"][number], now = Date.now()): string | null {
  const state = getTableDisplayState(table);
  if (state === "free") return null;
  const timestamp = state === "bill_printed" ? table.timer_ended_at : table.occupied_at;
  if (!timestamp) return null;
  const start = Date.parse(timestamp);
  if (!Number.isFinite(start)) return null;
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  // Tiles are narrow: past ten hours the minutes stop mattering, so "24h" instead of "24h 15m".
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours >= 10 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
}
