import { eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { floors, restaurantTables } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";
import { getCurrentOrderSummaries } from "./read-models.js";
import type { TableRow } from "./types.js";

export function listTableReadModels(db: SqliteDatabase): unknown[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.floor_id, f.name AS floor_name, t.name, t.active, t.sort_order, t.status, t.current_order_id, t.occupied_at
       FROM restaurant_tables t
       JOIN floors f ON f.id = t.floor_id
       ORDER BY f.sort_order ASC, f.name ASC, t.sort_order ASC, t.name ASC`
    )
    .all() as Array<Record<string, unknown> & { current_order_id: string | null }>;
  const summaries = getCurrentOrderSummaries(db, rows.map((row) => row.current_order_id).filter((id): id is string => Boolean(id)));
  return rows.map((row) => {
    const summary = row.current_order_id ? summaries.get(row.current_order_id) : null;
    return {
      ...row,
      current_order_total_paise: summary?.totalPaise ?? 0,
      sent_item_count: summary?.itemCount ?? 0,
      timer_ended_at: summary?.timerEndedAt ?? null
    };
  });
}

export function listFloorReadModels(db: SqliteDatabase): unknown[] {
  return db.prepare("SELECT id, name, active, sort_order FROM floors ORDER BY sort_order ASC, name ASC").all();
}

export function requireTable(orm: HubOrm, tableId: string): TableRow {
  const table = orm
    .select({
      id: restaurantTables.id,
      name: restaurantTables.name,
      status: restaurantTables.status,
      current_order_id: restaurantTables.currentOrderId,
      occupied_at: restaurantTables.occupiedAt
    })
    .from(restaurantTables)
    .where(eq(restaurantTables.id, tableId))
    .get();
  if (!table) throw new DomainError("Table not found", 404);
  return table;
}

export function requireFloor(orm: HubOrm, floorId: string): void {
  const floor = orm.select({ id: floors.id }).from(floors).where(eq(floors.id, floorId)).get();
  if (!floor) throw new DomainError("Floor not found", 404);
}

export function nextFloorSortOrder(db: SqliteDatabase): number {
  const row = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM floors").get() as { next?: number } | undefined;
  return Number(row?.next ?? 0);
}

export function nextTableSortOrder(db: SqliteDatabase, floorId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM restaurant_tables WHERE floor_id = ?")
    .get(floorId) as { next?: number } | undefined;
  return Number(row?.next ?? 0);
}
