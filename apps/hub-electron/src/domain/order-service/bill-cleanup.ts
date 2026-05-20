import type { DomainEvent } from "@gaurav-pos/shared";
import { eq } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { orders } from "../../db/drizzle-schema.js";
import { listOrderItems } from "./order-item-queries.js";

export type BillCleanupContext = {
  orm: HubOrm;
  db: SqliteDatabase;
  deleteLocalBillRecord: (billId: string) => void;
  freeTable: (tableId: string) => void;
  appendEvent: (type: string, aggregateType: string, aggregateId: string, payload: unknown) => DomainEvent;
};

export function removeEmptyPendingBills(ctx: BillCleanupContext): void {
  const rows = ctx.db
    .prepare(
      `SELECT b.id AS bill_id, b.order_id, o.table_id
       FROM bills b
       JOIN orders o ON o.id = b.order_id
       WHERE b.status = 'pending'
         AND b.total_paise = 0
         AND b.final_total_paise = 0
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.bill_id = b.id)`
    )
    .all() as Array<{ bill_id: string; order_id: string; table_id: string }>;
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  const run = ctx.db.transaction(() => {
    for (const row of rows) {
      const remainingItems = listOrderItems(ctx.orm, row.order_id).filter((item) => item.quantity > 0 && item.status !== "cancelled");
      if (remainingItems.length > 0) continue;
      ctx.deleteLocalBillRecord(row.bill_id);
      ctx.orm.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, row.order_id)).run();
      ctx.freeTable(row.table_id);
      ctx.appendEvent("bill.empty_pending_removed", "order", row.order_id, {
        orderId: row.order_id,
        removedBillId: row.bill_id
      });
    }
  });
  run();
}
