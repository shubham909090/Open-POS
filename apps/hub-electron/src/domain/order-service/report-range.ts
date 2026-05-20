import type { ReportRangeQueryInput } from "@gaurav-pos/shared";
import type { SqliteDatabase } from "../../db/database.js";
import { currentBusinessDayWindow } from "../business-day.js";
import { DomainError } from "../errors.js";
import { businessDatesBetween, parseJsonArray } from "./helpers.js";
import type { DailyReportSnapshotRow, DaySummary } from "./types.js";

export function buildRangeReport(db: SqliteDatabase, input: ReportRangeQueryInput): unknown {
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
  const itemSummaryMap = new Map<string, DaySummary["itemSummaries"][number]>();
  const groupSummaryMap = new Map<string, DaySummary["groupSummaries"][number]>();
  const billSummaries: DaySummary["billSummaries"] = [];

  const totals = rows.reduce(
    (acc, row) => {
      acc.openOrders += row.open_orders;
      acc.billedOrders += row.billed_orders;
      acc.paidBills += row.paid_bills;
      acc.unpaidBills += row.unpaid_bills;
      acc.cancelledOrders += row.cancelled_orders;
      acc.billCount += row.bill_count;
      acc.grossSalesPaise += row.gross_sales_paise;
      acc.discountPaise += row.discount_paise;
      acc.tipPaise += row.tip_paise;
      acc.finalSalesPaise += row.final_sales_paise;
      acc.cashPaymentsPaise += row.cash_payments_paise;
      acc.upiPaymentsPaise += row.upi_payments_paise;
      acc.cardPaymentsPaise += row.card_payments_paise;
      acc.onlinePaymentsPaise += row.online_payments_paise;
      acc.totalPaymentsPaise += row.total_payments_paise;
      acc.nonCashPaymentsPaise += row.non_cash_payments_paise;
      return acc;
    },
    {
      openOrders: 0,
      billedOrders: 0,
      paidBills: 0,
      unpaidBills: 0,
      cancelledOrders: 0,
      billCount: 0,
      grossSalesPaise: 0,
      discountPaise: 0,
      tipPaise: 0,
      finalSalesPaise: 0,
      cashPaymentsPaise: 0,
      upiPaymentsPaise: 0,
      cardPaymentsPaise: 0,
      onlinePaymentsPaise: 0,
      totalPaymentsPaise: 0,
      nonCashPaymentsPaise: 0
    }
  );

  for (const row of rows) {
    for (const item of parseJsonArray<DaySummary["itemSummaries"][number]>(row.item_summaries_json)) {
      const key = item.menuItemId ? `${item.menuItemId}:${item.saleGroupId}` : `open:${item.saleGroupId}:${item.name}`;
      const current = itemSummaryMap.get(key) ?? { ...item, quantity: 0, grossSalesPaise: 0, ncQuantity: 0, ncGrossSalesPaise: 0 };
      current.name = item.name;
      current.saleGroupName = item.saleGroupName;
      current.saleGroupKind = item.saleGroupKind;
      current.quantity += item.quantity;
      current.grossSalesPaise += item.grossSalesPaise;
      current.ncQuantity += item.ncQuantity;
      current.ncGrossSalesPaise += item.ncGrossSalesPaise;
      itemSummaryMap.set(key, current);
    }
    for (const group of parseJsonArray<DaySummary["groupSummaries"][number]>(row.group_summaries_json)) {
      const current = groupSummaryMap.get(group.saleGroupId) ?? { ...group, quantity: 0, grossSalesPaise: 0, taxPaise: 0, finalSalesPaise: 0, ncQuantity: 0, ncGrossSalesPaise: 0 };
      current.quantity += group.quantity;
      current.grossSalesPaise += group.grossSalesPaise;
      current.taxPaise += group.taxPaise;
      current.finalSalesPaise += group.finalSalesPaise;
      current.ncQuantity += group.ncQuantity;
      current.ncGrossSalesPaise += group.ncGrossSalesPaise;
      groupSummaryMap.set(group.saleGroupId, current);
    }
    if (input.includeBills) billSummaries.push(...parseJsonArray<DaySummary["billSummaries"][number]>(row.bill_summaries_json));
  }

  billSummaries.sort((left, right) => {
    const time = new Date(right.settledAt ?? "").getTime() - new Date(left.settledAt ?? "").getTime();
    if (Number.isFinite(time) && time !== 0) return time;
    return (right.billNumber ?? 0) - (left.billNumber ?? 0);
  });

  return {
    range: { from: input.from, to: input.to },
    availableDays: rows.map((row) => ({
      pos_day_id: row.pos_day_id,
      business_date: row.business_date,
      status: row.status,
      bill_count: row.bill_count,
      gross_sales_paise: row.gross_sales_paise,
      discount_paise: row.discount_paise,
      tip_paise: row.tip_paise,
      final_sales_paise: row.final_sales_paise,
      cash_payments_paise: row.cash_payments_paise,
      upi_payments_paise: row.upi_payments_paise,
      card_payments_paise: row.card_payments_paise,
      online_payments_paise: row.online_payments_paise,
      total_payments_paise: row.total_payments_paise,
      finalized_at: row.finalized_at
    })),
    missingDates,
    unfinalizedDates,
    ...totals,
    itemSummaries: [...itemSummaryMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    groupSummaries: [...groupSummaryMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    ...(input.includeBills ? { billSummaries } : {})
  };
}
