import { max } from "drizzle-orm";
import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { bills, kots } from "../../db/drizzle-schema.js";

export function nextKotSequence(orm: HubOrm): number {
  const row = orm.select({ current: max(kots.sequence) }).from(kots).get();
  return (row?.current ?? 0) + 1;
}

export function nextBillNumber(orm: HubOrm, writeSetting: (key: string, value: string) => void): number {
  const row = orm.select({ current: max(bills.billNumber) }).from(bills).get();
  const next = (row?.current ?? 0) + 1;
  writeSetting("bill_number_sequence", String(next));
  return next;
}

export function sequenceForKotGroup(
  orm: HubOrm,
  db: SqliteDatabase,
  orderId: string,
  productionUnitId: string,
  ticketLabel: "KOT" | "BOT"
): number {
  const existing = db
    .prepare(
      `SELECT k.sequence
       FROM kots k
       WHERE k.order_id = ?
         AND k.production_unit_id = ?
         AND k.ticket_label = ?
       ORDER BY k.created_at ASC, k.rowid ASC
       LIMIT 1`
    )
    .get(orderId, productionUnitId, ticketLabel) as { sequence: number } | undefined;
  return existing?.sequence ?? nextKotSequence(orm);
}
