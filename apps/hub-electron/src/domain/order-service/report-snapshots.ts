import type { SqliteDatabase } from "../../db/database.js";
import { DomainError } from "../errors.js";

type DailyReportSnapshotRow = Record<string, unknown> & {
  bill_summaries_json: string;
  item_summaries_json: string;
  group_summaries_json?: string;
};

export function listDailyReportSnapshots(db: SqliteDatabase, limit = 30): unknown[] {
  return db
    .prepare(
      `SELECT pos_day_id, business_date, status, bill_count, gross_sales_paise, final_sales_paise,
        total_payments_paise, finalized_at
       FROM daily_report_snapshots
       ORDER BY business_date DESC, finalized_at DESC
       LIMIT ?`
    )
    .all(limit);
}

export function getDailyReportSnapshot(db: SqliteDatabase, posDayId: string): unknown {
  const row = db.prepare("SELECT * FROM daily_report_snapshots WHERE pos_day_id = ?").get(posDayId) as DailyReportSnapshotRow | undefined;
  if (!row) throw new DomainError("Daily report not found", 404);
  return {
    ...row,
    billSummaries: JSON.parse(row.bill_summaries_json),
    itemSummaries: JSON.parse(row.item_summaries_json),
    groupSummaries: row.group_summaries_json ? JSON.parse(row.group_summaries_json) : []
  };
}
