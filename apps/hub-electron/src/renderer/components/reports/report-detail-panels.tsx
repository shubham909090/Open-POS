import { type ReactNode, useState } from "react";
import { formatInr } from "@gaurav-pos/shared";
import { type CloseSummary, type DailyReportDetail, type RangeReportDetail } from "../../hub-api.js";
import { ReportHistoryPanel } from "./report-history-panel.js";

const DETAIL_PAGE_SIZE = 6;
type ReportSummary = CloseSummary | DailyReportDetail | RangeReportDetail;

export function ReportDetailPanels({ summary, billHistoryPlaceholder }: { summary: ReportSummary; billHistoryPlaceholder?: ReactNode }) {
  const [itemLimit, setItemLimit] = useState(DETAIL_PAGE_SIZE);
  const hasBillSummaries = Array.isArray(summary.billSummaries);
  const bills = [...(summary.billSummaries ?? [])].sort((left, right) => (right.billNumber ?? 0) - (left.billNumber ?? 0));
  const groups = summary.groupSummaries ?? [];
  const items = summary.itemSummaries ?? [];
  const payments = getPaymentTotals(summary, bills);

  return (
    <div className="report-detail-grid">
      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Payments</strong>
          <span>{formatInr(payments.total)} collected</span>
        </div>
        <ReportTable
          columns={["Method", "Amount"]}
          rows={[
            ["Cash", formatInr(payments.cash)],
            ["UPI", formatInr(payments.upi)],
            ["Card", formatInr(payments.card)],
            ["Online", formatInr(payments.online)],
          ]}
        />
      </section>

      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Sale & tax categories</strong>
          <span>{groups.length} categories</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Qty</th>
                <th>Tax</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.saleGroupId}>
                  <td className="strong-cell">{group.name}</td>
                  <td>{group.quantity}</td>
                  <td>{formatInr(group.taxPaise)}</td>
                  <td>{formatInr(group.finalSalesPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!groups.length ? <p className="plain-state">No category totals yet.</p> : null}
        </div>
      </section>

      <ReportHistoryPanel bills={bills} hasBillSummaries={hasBillSummaries} billHistoryPlaceholder={billHistoryPlaceholder} />

      <section className="report-detail-card item-summary-panel">
        <div className="mini-title">
          <strong>Item summary</strong>
          <span>{items.length} items</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table item-summary-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Group</th>
                <th>Sold</th>
                <th>Gross</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, itemLimit).map((item) => (
                <tr key={item.menuItemId}>
                  <td className="strong-cell">{item.name}</td>
                  <td>{item.saleGroupName}</td>
                  <td>{item.quantity}</td>
                  <td>{formatInr(item.grossSalesPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? <p className="plain-state">No item totals yet.</p> : null}
          {items.length > itemLimit ? (
            <button type="button" className="load-more-button compact" onClick={() => setItemLimit((limit) => limit + DETAIL_PAGE_SIZE)}>
              Load more items
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReportTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="report-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join(":")}>
              {row.map((cell, index) => (
                <td key={`${cell}-${index}`} className={index === 0 ? "strong-cell" : ""}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getPaymentTotals(summary: ReportSummary, bills: NonNullable<CloseSummary["billSummaries"]>) {
  if ("totalPaymentsPaise" in summary) {
    return {
      cash: summary.cashPaymentsPaise,
      upi: summary.upiPaymentsPaise,
      card: summary.cardPaymentsPaise,
      online: summary.onlinePaymentsPaise,
      total: summary.totalPaymentsPaise,
    };
  }
  const totals = { cash: 0, upi: 0, card: 0, online: 0, total: 0 };
  for (const bill of bills) {
    for (const payment of bill.payments) {
      if (payment.method === "cash") totals.cash += payment.amountPaise;
      if (payment.method === "upi") totals.upi += payment.amountPaise;
      if (payment.method === "card") totals.card += payment.amountPaise;
      if (payment.method === "online") totals.online += payment.amountPaise;
      totals.total += payment.amountPaise;
    }
  }
  return totals;
}
