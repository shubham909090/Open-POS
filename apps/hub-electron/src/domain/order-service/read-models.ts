import { calculateLineTotal } from "@gaurav-pos/shared";
import { desc } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { cloudCommandFailures } from "../../db/drizzle-schema.js";
import { DomainError } from "../errors.js";

export function listKdsTickets(db: SqliteDatabase, productionUnitId: string): unknown[] {
  const rows = db
    .prepare(
      `SELECT k.id, k.order_id, k.production_unit_id, k.sequence, k.type, k.status, k.reason, k.note, k.created_at,
        t.name AS table_name, o.captain_id
       FROM kots k
       JOIN orders o ON o.id = k.order_id
       JOIN restaurant_tables t ON t.id = o.table_id
       JOIN production_units pu ON pu.id = k.production_unit_id
       WHERE k.production_unit_id = ? AND pu.kds_enabled = 1 AND k.status IN ('queued', 'preparing', 'ready')
       ORDER BY k.created_at ASC, k.rowid ASC`
    )
    .all(productionUnitId);

  return rows.map((row) => ({
    ...(row as Record<string, unknown>),
    items: db
      .prepare("SELECT name_snapshot, quantity_delta, note_snapshot FROM kot_items WHERE kot_id = ? ORDER BY id")
      .all((row as { id: string }).id)
  }));
}

export function getOrderReadModel(db: SqliteDatabase, orderId: string): unknown {
  const order = db
    .prepare(
      `SELECT o.*, t.name AS table_name, f.name AS floor_name
       FROM orders o
       JOIN restaurant_tables t ON t.id = o.table_id
       JOIN floors f ON f.id = t.floor_id
       WHERE o.id = ?`
    )
    .get(orderId);
  if (!order) throw new DomainError("Order not found", 404);

  const items = db
    .prepare(
      `SELECT oi.*, pu.name AS production_unit_name
       FROM order_items oi
       LEFT JOIN production_units pu ON pu.id = oi.production_unit_id
       WHERE oi.order_id = ?
       ORDER BY oi.created_at, oi.id`
    )
    .all(orderId);
  const kots = db
    .prepare(
      `SELECT k.*, pu.name AS production_unit_name
       FROM kots k
       JOIN production_units pu ON pu.id = k.production_unit_id
       WHERE k.order_id = ?
       ORDER BY k.sequence`
    )
    .all(orderId)
    .map((kot) => ({
      ...(kot as Record<string, unknown>),
      items: db
        .prepare("SELECT name_snapshot, quantity_delta FROM kot_items WHERE kot_id = ? ORDER BY id")
        .all((kot as { id: string }).id)
    }));
  const bill = db.prepare("SELECT * FROM bills WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").get(orderId);
  const payments = (bill
    ? db.prepare("SELECT * FROM payments WHERE bill_id = ? ORDER BY created_at").all((bill as { id: string }).id)
    : []) as Array<{ amount_paise: number } & Record<string, unknown>>;
  const paidPaise = payments.reduce((total, payment) => total + ((payment as { amount_paise?: number }).amount_paise ?? 0), 0);
  const billRecord = bill as ({ final_total_paise?: number; total_paise?: number } & Record<string, unknown>) | undefined;
  const finalTotalPaise = billRecord?.final_total_paise ?? billRecord?.total_paise ?? 0;

  return {
    order,
    items,
    kots,
    bill: bill
      ? {
          ...(bill as Record<string, unknown>),
          paid_paise: paidPaise,
          remaining_paise: Math.max(0, finalTotalPaise - paidPaise)
        }
      : null,
    payments
  };
}

export function listPrintJobReadModels(db: SqliteDatabase, limit: number): unknown[] {
  return db
    .prepare(
      `SELECT id, target_type, target_id, production_unit_id, printer_host, printer_port, printer_name,
        status, attempts, last_error, created_at, updated_at
       FROM print_jobs
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit);
}

export function getSyncStatusReadModel(orm: HubOrm, db: SqliteDatabase): unknown {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS count FROM sync_outbox GROUP BY status ORDER BY status")
    .all() as Array<{ status: string; count: number }>;
  const lastEvent = db
    .prepare("SELECT event_id, type, created_at FROM event_log ORDER BY id DESC LIMIT 1")
    .get();
  const commandFailures = orm
    .select({
      commandId: cloudCommandFailures.commandId,
      type: cloudCommandFailures.type,
      error: cloudCommandFailures.error,
      failedAt: cloudCommandFailures.failedAt
    })
    .from(cloudCommandFailures)
    .orderBy(desc(cloudCommandFailures.failedAt))
    .limit(10)
    .all();
  return {
    counts: Object.fromEntries(rows.map((row) => [row.status, row.count])),
    lastEvent: lastEvent ?? null,
    commandFailures
  };
}

export function getCurrentOrderSummaries(db: SqliteDatabase, orderIds: string[]): Map<string, { totalPaise: number; itemCount: number; timerEndedAt: string | null }> {
  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length === 0) return new Map();
  const placeholders = uniqueOrderIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT order_id, unit_price_paise, quantity
       FROM order_items
       WHERE order_id IN (${placeholders})
         AND status != 'cancelled'
         AND quantity > 0`
    )
    .all(...uniqueOrderIds) as Array<{ order_id: string; unit_price_paise: number; quantity: number }>;
  const billedRows = db
    .prepare(
      `SELECT order_id, MAX(created_at) AS timer_ended_at
       FROM bills
       WHERE order_id IN (${placeholders})
       GROUP BY order_id`
    )
    .all(...uniqueOrderIds) as Array<{ order_id: string; timer_ended_at: string | null }>;
  const billedAtByOrder = new Map(billedRows.map((row) => [row.order_id, row.timer_ended_at]));
  const summaries = new Map<string, { totalPaise: number; itemCount: number; timerEndedAt: string | null }>();
  for (const item of rows) {
    const lineSubtotal = calculateLineTotal(item.unit_price_paise, item.quantity);
    const current = summaries.get(item.order_id) ?? { totalPaise: 0, itemCount: 0, timerEndedAt: billedAtByOrder.get(item.order_id) ?? null };
    current.totalPaise += lineSubtotal;
    current.itemCount += item.quantity;
    summaries.set(item.order_id, current);
  }
  for (const orderId of uniqueOrderIds) {
    if (!summaries.has(orderId)) summaries.set(orderId, { totalPaise: 0, itemCount: 0, timerEndedAt: billedAtByOrder.get(orderId) ?? null });
  }
  return summaries;
}
