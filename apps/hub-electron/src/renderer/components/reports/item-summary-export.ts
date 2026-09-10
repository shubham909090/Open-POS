import type { CloseSummary, DailyReportDetail, RangeReportDetail } from "../../hub-api.js";

export function buildItemSummaryExport(summary: CloseSummary | DailyReportDetail | RangeReportDetail) {
  const period = "range" in summary
    ? `${summary.range.from}-to-${summary.range.to}`
    : "businessDay" in summary ? summary.businessDay.business_date : summary.business_date;
  const rows: Array<Array<string | number>> = [
    ["Item", "Group", "Sold", "Gross (INR)"],
    ...(summary.itemSummaries ?? []).map((item) => [
      item.name, item.saleGroupName, item.quantity, (item.grossSalesPaise / 100).toFixed(2),
    ]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return { fileName: `item-summary-${period}.csv`, csv };
}

function csvCell(value: string | number): string {
  let text = String(value);
  // Spreadsheet applications must treat menu names as text, never formulas.
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
