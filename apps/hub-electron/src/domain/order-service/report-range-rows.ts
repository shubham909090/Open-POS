import type { ReportRangeQueryInput } from "@gaurav-pos/shared";

import type { SqliteDatabase } from "../../db/database.js";
import { currentBusinessDayWindow } from "../business-day.js";
import { DomainError } from "../errors.js";
import { businessDatesBetween } from "./helpers.js";
import type { DailyReportSnapshotRow } from "./types.js";

export type RangeReportRows = {
  rows: DailyReportSnapshotRow[];
  missingDates: string[];
  unfinalizedDates: string[];
};

export function loadRangeReportRows(db: SqliteDatabase, input: ReportRangeQueryInput): RangeReportRows {
  const currentBusinessDate = currentBusinessDayWindow(new Date()).businessDate;
  if (input.from > currentBusinessDate) throw new DomainError("Report range starts after the current business day", 400);

  const rows = db
    .prepare(
      `SELECT *
       FROM daily_report_snapshots
       WHERE business_date BETWEEN ? AND ?
       ORDER BY business_date ASC, finalized_at ASC`
    )
    .all(input.from, input.to) as DailyReportSnapshotRow[];
  const posDayRows = db
    .prepare(
      `SELECT business_date, status
       FROM pos_days
       WHERE business_date BETWEEN ? AND ?
       ORDER BY business_date ASC`
    )
    .all(input.from, input.to) as Array<{ business_date: string; status: string }>;

  const availableDates = new Set(rows.map((row) => row.business_date));
  const unfinalizedDates = posDayRows
    .filter((row) => row.status !== "finalized" && !availableDates.has(row.business_date))
    .map((row) => row.business_date);
  const unfinalizedSet = new Set(unfinalizedDates);
  const missingDates = businessDatesBetween(input.from, input.to).filter((date) => !availableDates.has(date) && !unfinalizedSet.has(date));

  return { rows, missingDates, unfinalizedDates };
}

export function requireCompleteFinalizedRange(result: RangeReportRows): void {
  if (!result.missingDates.length && !result.unfinalizedDates.length) return;

  const parts = [
    result.missingDates.length ? `Missing finalized reports: ${result.missingDates.join(", ")}` : "",
    result.unfinalizedDates.length ? `Unfinalized reports: ${result.unfinalizedDates.join(", ")}` : ""
  ].filter(Boolean);
  throw new DomainError(`Export needs every selected date finalized. ${parts.join(". ")}`, 400);
}
