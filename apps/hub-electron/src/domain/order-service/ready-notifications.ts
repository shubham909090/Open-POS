import { and, desc, eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { readyNotifications } from "../../db/drizzle-schema.js";
import { makeId } from "../ids.js";
import type { DeviceActor } from "./types.js";

export function createReadyNotification(orm: HubOrm, db: SqliteDatabase, kotId: string): void {
  const row = db
    .prepare(
      `SELECT k.id, k.order_id, k.production_unit_id, o.table_id, o.captain_id, o.captain_device_id,
        t.name AS table_name, pu.name AS production_unit_name
       FROM kots k
       JOIN orders o ON o.id = k.order_id
       JOIN restaurant_tables t ON t.id = o.table_id
       JOIN production_units pu ON pu.id = k.production_unit_id
       WHERE k.id = ?`
    )
    .get(kotId) as
    | {
        id: string;
        order_id: string;
        production_unit_id: string;
        table_id: string;
        captain_id: string;
        captain_device_id: string | null;
        table_name: string;
        production_unit_name: string;
      }
    | undefined;
  if (!row || !row.captain_device_id) return;

  const exists = orm.select({ id: readyNotifications.id }).from(readyNotifications).where(eq(readyNotifications.kotId, kotId)).get();
  if (exists) return;

  const items = db
    .prepare("SELECT name_snapshot, ABS(quantity_delta) AS quantity FROM kot_items WHERE kot_id = ? AND quantity_delta > 0 ORDER BY id")
    .all(kotId) as Array<{ name_snapshot: string; quantity: number }>;
  orm
    .insert(readyNotifications)
    .values({
      id: makeId("ready"),
      kotId,
      orderId: row.order_id,
      tableId: row.table_id,
      tableName: row.table_name,
      productionUnitId: row.production_unit_id,
      productionUnitName: row.production_unit_name,
      captainDeviceId: row.captain_device_id,
      captainId: row.captain_id,
      itemsJson: JSON.stringify(items.map((item) => ({ name: item.name_snapshot, quantity: item.quantity }))),
      status: "unread",
      createdAt: new Date().toISOString()
    })
    .run();
}

export function listReadyNotifications(orm: HubOrm, actor: DeviceActor): unknown[] {
  if (actor.role !== "captain" && actor.role !== "waiter") return [];
  const rows = orm
    .select()
    .from(readyNotifications)
    .where(
      and(
        eq(readyNotifications.captainDeviceId, actor.id),
        eq(readyNotifications.status, "unread")
      )
    )
    .orderBy(desc(readyNotifications.createdAt))
    .limit(20)
    .all();
  const now = new Date().toISOString();
  for (const row of rows) {
    orm.update(readyNotifications).set({ status: "seen", acknowledgedAt: now }).where(eq(readyNotifications.id, row.id)).run();
  }
  return rows.map((row) => ({
    id: row.id,
    kotId: row.kotId,
    orderId: row.orderId,
    tableId: row.tableId,
    tableName: row.tableName,
    productionUnitName: row.productionUnitName,
    items: JSON.parse(row.itemsJson) as Array<{ name: string; quantity: number }>,
    createdAt: row.createdAt
  }));
}
