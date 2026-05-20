import { and, count, eq, inArray } from "drizzle-orm";

import type { HubOrm, SqliteDatabase } from "../../db/database.js";
import { dailyReportSnapshots, orders, posDays } from "../../db/drizzle-schema.js";
import { currentBusinessDayWindow } from "../business-day.js";
import { buildDaySummary } from "./report-summary.js";
import type { BusinessDayRow, DaySummary } from "./types.js";

type AppendEvent = (type: string, aggregateType: string, aggregateId: string, payload: unknown) => void;

export function ensureCurrentBusinessDay(input: {
  orm: HubOrm;
  now?: Date;
  appendEvent: AppendEvent;
}): BusinessDayRow {
  const { orm, appendEvent } = input;
  const now = input.now ?? new Date();
  const window = currentBusinessDayWindow(now);
  const existing = getBusinessDayById(orm, window.id);
  if (existing) return existing;

  const insertResult = orm
    .insert(posDays)
    .values({
      id: window.id,
      outletId: "outlet-main",
      businessDate: window.businessDate,
      status: "active",
      periodStartAt: window.periodStartAt,
      periodEndAt: window.periodEndAt,
      createdAt: now.toISOString()
    })
    .onConflictDoNothing()
    .run();
  if (insertResult.changes > 0) appendEvent("business_day.started", "business_day", window.id, window);
  return getBusinessDayById(orm, window.id) as BusinessDayRow;
}

export function getBusinessDayById(orm: HubOrm, id: string): BusinessDayRow | undefined {
  return orm
    .select({
      id: posDays.id,
      business_date: posDays.businessDate,
      period_start_at: posDays.periodStartAt,
      period_end_at: posDays.periodEndAt,
      status: posDays.status
    })
    .from(posDays)
    .where(eq(posDays.id, id))
    .get();
}

export function finalizeCompletedBusinessDays(input: {
  orm: HubOrm;
  db: SqliteDatabase;
  now?: Date;
  appendEvent: AppendEvent;
}): void {
  const { orm, db, appendEvent } = input;
  const now = input.now ?? new Date();
  const currentBusinessDate = currentBusinessDayWindow(now).businessDate;
  const candidates = db
    .prepare(
      `SELECT id, business_date
       FROM pos_days
       WHERE business_date < ?
         AND id NOT IN (SELECT pos_day_id FROM daily_report_snapshots)`
    )
    .all(currentBusinessDate) as Array<{ id: string; business_date: string }>;

  for (const candidate of candidates) {
    const blocker = orm
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.posDayId, candidate.id), inArray(orders.status, ["open", "billed"])))
      .get();
    if ((blocker?.count ?? 0) > 0) continue;
    finalizeBusinessDay({ orm, db, posDayId: candidate.id, now, appendEvent });
  }
}

export function finalizeBusinessDay(input: {
  orm: HubOrm;
  db: SqliteDatabase;
  posDayId: string;
  now?: Date;
  appendEvent: AppendEvent;
}): DaySummary {
  const { orm, db, posDayId, appendEvent } = input;
  const report = buildDaySummary(db, posDayId);
  const finalizedAt = (input.now ?? new Date()).toISOString();
  const run = db.transaction(() => {
    const snapshotExists = orm
      .select({ posDayId: dailyReportSnapshots.posDayId })
      .from(dailyReportSnapshots)
      .where(eq(dailyReportSnapshots.posDayId, posDayId))
      .get();
    if (snapshotExists) return false;

    orm
      .update(posDays)
      .set({ status: "finalized", finalizedAt })
      .where(eq(posDays.id, posDayId))
      .run();

    orm
      .insert(dailyReportSnapshots)
      .values({
        posDayId,
        businessDate: report.businessDay.business_date,
        status: "finalized",
        billCount: report.billCount,
        openOrders: report.openOrders,
        billedOrders: report.billedOrders,
        paidBills: report.paidBills,
        unpaidBills: report.unpaidBills,
        cancelledOrders: report.cancelledOrders,
        grossSalesPaise: report.grossSalesPaise,
        discountPaise: report.discountPaise,
        tipPaise: report.tipPaise,
        finalSalesPaise: report.finalSalesPaise,
        cashPaymentsPaise: report.cashPaymentsPaise,
        upiPaymentsPaise: report.upiPaymentsPaise,
        cardPaymentsPaise: report.cardPaymentsPaise,
        onlinePaymentsPaise: report.onlinePaymentsPaise,
        totalPaymentsPaise: report.totalPaymentsPaise,
        nonCashPaymentsPaise: report.nonCashPaymentsPaise,
        billSummariesJson: JSON.stringify(report.billSummaries),
        itemSummariesJson: JSON.stringify(report.itemSummaries),
        groupSummariesJson: JSON.stringify(report.groupSummaries),
        finalizedAt,
        updatedAt: finalizedAt
      })
      .run();

    appendEvent("daily_report.finalized", "daily_report", posDayId, {
      posDayId,
      businessDate: report.businessDay.business_date,
      finalizedAt,
      ...report
    });
    return true;
  });
  run();
  return report;
}

export function refreshDailyReportSnapshot(input: {
  orm: HubOrm;
  db: SqliteDatabase;
  posDayId: string;
  now?: string;
}): void {
  const { orm, db, posDayId } = input;
  const snapshotExists = orm
    .select({ posDayId: dailyReportSnapshots.posDayId })
    .from(dailyReportSnapshots)
    .where(eq(dailyReportSnapshots.posDayId, posDayId))
    .get();
  if (!snapshotExists) return;
  const report = buildDaySummary(db, posDayId);
  orm
    .update(dailyReportSnapshots)
    .set({
      billCount: report.billCount,
      openOrders: report.openOrders,
      billedOrders: report.billedOrders,
      paidBills: report.paidBills,
      unpaidBills: report.unpaidBills,
      cancelledOrders: report.cancelledOrders,
      grossSalesPaise: report.grossSalesPaise,
      discountPaise: report.discountPaise,
      tipPaise: report.tipPaise,
      finalSalesPaise: report.finalSalesPaise,
      cashPaymentsPaise: report.cashPaymentsPaise,
      upiPaymentsPaise: report.upiPaymentsPaise,
      cardPaymentsPaise: report.cardPaymentsPaise,
      onlinePaymentsPaise: report.onlinePaymentsPaise,
      totalPaymentsPaise: report.totalPaymentsPaise,
      nonCashPaymentsPaise: report.nonCashPaymentsPaise,
      billSummariesJson: JSON.stringify(report.billSummaries),
      itemSummariesJson: JSON.stringify(report.itemSummaries),
      groupSummariesJson: JSON.stringify(report.groupSummaries),
      updatedAt: input.now ?? new Date().toISOString()
    })
    .where(eq(dailyReportSnapshots.posDayId, posDayId))
    .run();
}
