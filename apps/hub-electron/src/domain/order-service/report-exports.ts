import AdmZip from "adm-zip";
import {
  defaultTallyExportSettings,
  defaultTallySaleLedgerName,
  type ReportRangeQueryInput,
  type TallyExportSettingsInput
} from "@gaurav-pos/shared";

import type { SqliteDatabase } from "../../db/database.js";
import { DomainError } from "../errors.js";
import { parseJsonArray } from "./helpers.js";
import { loadRangeReportRows, requireCompleteFinalizedRange } from "./report-range-rows.js";
import type { DailyReportSnapshotRow, DaySummary } from "./types.js";

export type ReportExportFile = {
  fileName: string;
  contentType: string;
  body: Buffer;
};

type LedgerEntry = {
  ledgerName: string;
  amountPaise: number;
  deemedPositive: boolean;
  partyLedger?: boolean;
};

export function exportRangeCsvZip(db: SqliteDatabase, input: ReportRangeQueryInput): ReportExportFile {
  const exportRows = loadRangeReportRows(db, input);
  requireCompleteFinalizedRange(exportRows);
  const zip = new AdmZip();
  const prefix = `reports-${input.from}-to-${input.to}`;

  zip.addFile("daily-totals.csv", Buffer.from(buildDailyTotalsCsv(exportRows.rows), "utf8"));
  zip.addFile("category-totals.csv", Buffer.from(buildCategoryTotalsCsv(exportRows.rows), "utf8"));
  zip.addFile("item-totals.csv", Buffer.from(buildItemTotalsCsv(exportRows.rows), "utf8"));
  zip.addFile("bill-history.csv", Buffer.from(buildBillHistoryCsv(exportRows.rows), "utf8"));
  zip.addFile("bill-items.csv", Buffer.from(buildBillItemsCsv(exportRows.rows), "utf8"));
  zip.addFile("export-summary.csv", Buffer.from(buildExportSummaryCsv(input, exportRows.rows), "utf8"));

  return {
    fileName: `${prefix}.zip`,
    contentType: "application/zip",
    body: zip.toBuffer()
  };
}

export function exportRangeTallyXml(db: SqliteDatabase, input: ReportRangeQueryInput, settings: TallyExportSettingsInput = defaultTallyExportSettings()): ReportExportFile {
  const exportRows = loadRangeReportRows(db, input);
  requireCompleteFinalizedRange(exportRows);
  const xml = buildTallyXml(exportRows.rows, settings);
  return {
    fileName: `tally-${input.from}-to-${input.to}.xml`,
    contentType: "application/xml; charset=utf-8",
    body: Buffer.from(xml, "utf8")
  };
}

function buildDailyTotalsCsv(rows: DailyReportSnapshotRow[]): string {
  return csv([
    [
      "business_date",
      "bill_count",
      "gross_sales",
      "discounts",
      "tips",
      "final_sales",
      "cash",
      "upi",
      "card",
      "online",
      "total_payments",
      "finalized_at"
    ],
    ...rows.map((row) => [
      row.business_date,
      row.bill_count,
      money(row.gross_sales_paise),
      money(row.discount_paise),
      money(row.tip_paise),
      money(row.final_sales_paise),
      money(row.cash_payments_paise),
      money(row.upi_payments_paise),
      money(row.card_payments_paise),
      money(row.online_payments_paise),
      money(row.total_payments_paise),
      row.finalized_at
    ])
  ]);
}

function buildCategoryTotalsCsv(rows: DailyReportSnapshotRow[]): string {
  const records = rows.flatMap((row) =>
    groupSummaries(row).map((group) => [
      row.business_date,
      group.saleGroupId,
      group.name,
      group.kind,
      group.quantity,
      money(group.grossSalesPaise),
      money(group.taxPaise),
      money(group.finalSalesPaise),
      group.ncQuantity,
      money(group.ncGrossSalesPaise)
    ])
  );
  return csv([["business_date", "sale_group_id", "category", "kind", "quantity", "gross_sales", "tax", "final_sales", "nc_quantity", "nc_gross_sales"], ...records]);
}

function buildItemTotalsCsv(rows: DailyReportSnapshotRow[]): string {
  const records = rows.flatMap((row) =>
    itemSummaries(row).map((item) => [
      row.business_date,
      item.menuItemId,
      item.name,
      item.saleGroupId,
      item.saleGroupName,
      item.saleGroupKind,
      item.quantity,
      money(item.grossSalesPaise),
      item.ncQuantity,
      money(item.ncGrossSalesPaise)
    ])
  );
  return csv([["business_date", "menu_item_id", "item", "sale_group_id", "category", "kind", "quantity", "gross_sales", "nc_quantity", "nc_gross_sales"], ...records]);
}

function buildBillHistoryCsv(rows: DailyReportSnapshotRow[]): string {
  const records = rows.flatMap((row) =>
    billSummaries(row).map((bill) => [
      row.business_date,
      bill.billNumber ?? "",
      bill.billId,
      bill.tableName,
      bill.status,
      money(bill.subtotalPaise ?? 0),
      money(bill.taxPaise ?? 0),
      money(bill.totalPaise),
      money(bill.discountPaise),
      money(bill.tipPaise),
      money(bill.finalTotalPaise),
      money(bill.paidPaise),
      bill.settledAt ?? "",
      bill.payments.map((payment) => `${payment.method}:${money(payment.amountPaise)}${payment.reference ? `:${payment.reference}` : ""}`).join(" | "),
      bill.isNc ? "yes" : "no",
      bill.modified ? "yes" : "no"
    ])
  );
  return csv([["business_date", "bill_number", "bill_id", "table", "status", "subtotal", "tax", "total", "discount", "tip", "final_total", "paid", "settled_at", "payments", "is_nc", "modified"], ...records]);
}

function buildBillItemsCsv(rows: DailyReportSnapshotRow[]): string {
  const records = rows.flatMap((row) =>
    billSummaries(row).flatMap((bill) =>
      (bill.items ?? []).map((item) => [
        row.business_date,
        bill.billNumber ?? "",
        bill.billId,
        item.orderItemId ?? "",
        item.menuItemId ?? "",
        item.menuItemVariantId ?? "",
        item.name,
        item.saleGroupId ?? "",
        item.quantity,
        money(item.unitPricePaise),
        money(item.lineTotalPaise)
      ])
    )
  );
  return csv([["business_date", "bill_number", "bill_id", "order_item_id", "menu_item_id", "variant_id", "item", "sale_group_id", "quantity", "unit_price", "line_total"], ...records]);
}

function buildExportSummaryCsv(input: ReportRangeQueryInput, rows: DailyReportSnapshotRow[]): string {
  const totals = rows.reduce(
    (acc, row) => {
      acc.billCount += row.bill_count;
      acc.finalSales += row.final_sales_paise;
      acc.totalPayments += row.total_payments_paise;
      return acc;
    },
    { billCount: 0, finalSales: 0, totalPayments: 0 }
  );
  return csv([
    ["key", "value"],
    ["from", input.from],
    ["to", input.to],
    ["finalized_days", rows.length],
    ["bill_count", totals.billCount],
    ["final_sales", money(totals.finalSales)],
    ["total_payments", money(totals.totalPayments)]
  ]);
}

function buildTallyXml(rows: DailyReportSnapshotRow[], settings: TallyExportSettingsInput): string {
  const vouchers = rows
    .map((row) => {
      const entries = tallyEntries(row, settings);
      return entries.length ? buildTallyVoucher(row, settings, entries) : null;
    })
    .filter((voucher): voucher is string => Boolean(voucher))
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "  <HEADER>",
    "    <VERSION>1</VERSION>",
    "    <TALLYREQUEST>Import</TALLYREQUEST>",
    "    <TYPE>Data</TYPE>",
    "    <ID>Vouchers</ID>",
    "  </HEADER>",
    "  <BODY>",
    "    <DESC></DESC>",
    "    <DATA>",
    vouchers,
    "    </DATA>",
    "  </BODY>",
    "</ENVELOPE>"
  ].join("\n");
}

function buildTallyVoucher(row: DailyReportSnapshotRow, settings: TallyExportSettingsInput, entries: LedgerEntry[]): string {
  const debitPaise = entries.filter((entry) => entry.deemedPositive).reduce((total, entry) => total + entry.amountPaise, 0);
  const creditPaise = entries.filter((entry) => !entry.deemedPositive).reduce((total, entry) => total + entry.amountPaise, 0);
  if (debitPaise !== creditPaise) {
    throw new DomainError(`Tally export is not balanced for ${row.business_date}. Debit ${money(debitPaise)} does not match credit ${money(creditPaise)}.`, 400);
  }

  return [
    "      <TALLYMESSAGE>",
    `        <VOUCHER VCHTYPE="${xml(settings.voucherTypeName)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `          <DATE>${row.business_date.replaceAll("-", "")}</DATE>`,
    `          <VOUCHERTYPENAME>${xml(settings.voucherTypeName)}</VOUCHERTYPENAME>`,
    `          <VOUCHERNUMBER>GPOS-${row.business_date.replaceAll("-", "")}</VOUCHERNUMBER>`,
    "          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>",
    "          <ISINVOICE>No</ISINVOICE>",
    `          <NARRATION>Gaurav POS sales report for ${xml(row.business_date)}</NARRATION>`,
    ...entries.map((entry) => tallyLedgerEntryXml(entry)),
    "        </VOUCHER>",
    "      </TALLYMESSAGE>"
  ].join("\n");
}

function tallyEntries(row: DailyReportSnapshotRow, settings: TallyExportSettingsInput): LedgerEntry[] {
  const debitEntries = combineEntries([
    ledger(settings.cashLedgerName, row.cash_payments_paise, true, true),
    ledger(settings.upiLedgerName, row.upi_payments_paise, true),
    ledger(settings.cardLedgerName, row.card_payments_paise, true),
    ledger(settings.onlineLedgerName, row.online_payments_paise, true),
    ledger(settings.discountLedgerName, row.discount_paise, true)
  ]);

  const saleEntries = salesLedgerEntries(row, settings);
  const creditEntries = combineEntries([...saleEntries, ledger(settings.tipLedgerName, row.tip_paise, false)]);
  return [...debitEntries, ...creditEntries];
}

function salesLedgerEntries(row: DailyReportSnapshotRow, settings: TallyExportSettingsInput): LedgerEntry[] {
  const groups = groupSummaries(row).filter((group) => group.grossSalesPaise > 0);
  if (!groups.length && row.gross_sales_paise > 0) return [ledger(settings.saleLedgerNames.default ?? defaultTallySaleLedgerName(""), row.gross_sales_paise, false)];
  const entries = groups.map((group) => ledger(settings.saleLedgerNames[group.saleGroupId] ?? defaultTallySaleLedgerName(group.name), group.grossSalesPaise, false));
  const groupedTotal = groups.reduce((total, group) => total + group.grossSalesPaise, 0);
  const remainder = row.gross_sales_paise - groupedTotal;
  if (remainder > 0) entries.push(ledger(settings.saleLedgerNames.default ?? defaultTallySaleLedgerName(""), remainder, false));
  return entries;
}

function tallyLedgerEntryXml(entry: LedgerEntry): string {
  const amount = entry.deemedPositive ? -entry.amountPaise : entry.amountPaise;
  return [
    "          <LEDGERENTRIES.LIST>",
    `            <LEDGERNAME>${xml(entry.ledgerName)}</LEDGERNAME>`,
    `            <ISDEEMEDPOSITIVE>${entry.deemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    ...(entry.partyLedger ? ["            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>", `            <ISLASTDEEMEDPOSITIVE>${entry.deemedPositive ? "Yes" : "No"}</ISLASTDEEMEDPOSITIVE>`] : []),
    `            <AMOUNT>${amountXml(amount)}</AMOUNT>`,
    "          </LEDGERENTRIES.LIST>"
  ].join("\n");
}

function ledger(ledgerName: string, amountPaise: number, deemedPositive: boolean, partyLedger = false): LedgerEntry {
  return { ledgerName, amountPaise, deemedPositive, partyLedger };
}

function combineEntries(entries: LedgerEntry[]): LedgerEntry[] {
  const combined = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    if (entry.amountPaise <= 0) continue;
    const key = `${entry.deemedPositive}:${entry.ledgerName}`;
    const current = combined.get(key);
    if (current) {
      current.amountPaise += entry.amountPaise;
      current.partyLedger = current.partyLedger || entry.partyLedger;
    } else {
      combined.set(key, { ...entry });
    }
  }
  return [...combined.values()];
}

function groupSummaries(row: DailyReportSnapshotRow): DaySummary["groupSummaries"] {
  return parseJsonArray<DaySummary["groupSummaries"][number]>(row.group_summaries_json);
}

function itemSummaries(row: DailyReportSnapshotRow): DaySummary["itemSummaries"] {
  return parseJsonArray<DaySummary["itemSummaries"][number]>(row.item_summaries_json);
}

function billSummaries(row: DailyReportSnapshotRow): DaySummary["billSummaries"] {
  return parseJsonArray<DaySummary["billSummaries"][number]>(row.bill_summaries_json);
}

function csv(rows: Array<Array<string | number>>): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(paise: number): string {
  return (paise / 100).toFixed(2);
}

function amountXml(paise: number): string {
  return money(paise);
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
