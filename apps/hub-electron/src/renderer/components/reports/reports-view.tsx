import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatInr, formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type CloseSummary, type DailyReportDetail } from "../../hub-api.js";
import { alcoholMovementSourceLabel, alcoholMovementDeltaText } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";
import { Metric } from "../ui/metric.js";

const REPORT_PAGE_SIZE = 8;
const DETAIL_PAGE_SIZE = 6;

export function ReportsView() {
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [closedLimit, setClosedLimit] = useState(REPORT_PAGE_SIZE);
  const [stockLimit, setStockLimit] = useState(REPORT_PAGE_SIZE);
  const currentSummary = useQuery({
    queryKey: ["currentBusinessDaySummary"],
    queryFn: hubApi.currentBusinessDaySummary,
  });
  const dailyReports = useQuery({
    queryKey: ["dailyReports"],
    queryFn: hubApi.dailyReports,
  });
  const alcoholStockMovements = useQuery({
    queryKey: ["alcoholStockMovements"],
    queryFn: hubApi.alcoholStockMovements,
  });
  const dailyReportDetail = useQuery({
    queryKey: ["dailyReport", expandedReportId],
    queryFn: () => hubApi.dailyReport(expandedReportId ?? ""),
    enabled: Boolean(expandedReportId),
  });
  const summary = currentSummary.data;
  const closedReports = dailyReports.data ?? [];
  const stockMovements = alcoholStockMovements.data ?? [];

  return (
    <div className="reports-layout">
      <section className="panel">
        <div className="panel-title">
          <h2>Current business day</h2>
          <span>
            {summary?.businessDay.business_date ?? "6 AM IST boundary"}
          </span>
        </div>
        {summary ? (
          <>
            <div className="report-metrics">
              <Metric
                label="Sales"
                value={formatInr(summary.finalSalesPaise)}
              />
              <Metric
                label="Cash"
                value={formatInr(summary.cashPaymentsPaise)}
              />
              <Metric
                label="UPI/Card/Online"
                value={formatInr(summary.nonCashPaymentsPaise)}
              />
              <Metric label="Bills" value={String(summary.billCount)} />
            </div>
            <ReportDetailPanels summary={summary} />
          </>
        ) : (
          <EmptyState
            title="Report loading"
            description="The hub creates business days automatically at 6:00 AM IST."
          />
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Closed day reports</h2>
          <span>{closedReports.length} saved</span>
        </div>
        <div className="report-list">
          {closedReports.slice(0, closedLimit).map((report) => (
            <article key={report.pos_day_id} className="report-row">
              <div>
                <strong>{report.business_date}</strong>
                <span>
                  {report.bill_count} bills ·{" "}
                  {formatInr(report.final_sales_paise)} sales
                </span>
              </div>
              <div>
                <b>{formatInr(report.total_payments_paise)}</b>
                <span>
                  finalized {formatPosDateTime(report.finalized_at)}
                </span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setExpandedReportId(expandedReportId === report.pos_day_id ? null : report.pos_day_id)}
              >
                {expandedReportId === report.pos_day_id ? "Hide" : "Open"}
              </button>
              {expandedReportId === report.pos_day_id ? (
                <div className="report-row-detail">
                  {dailyReportDetail.isLoading ? (
                    <p className="plain-state">Loading report...</p>
                  ) : dailyReportDetail.data ? (
                    <ReportDetailPanels summary={dailyReportDetail.data} />
                  ) : (
                    <p className="warning-text">Report detail could not load.</p>
                  )}
                </div>
              ) : null}
            </article>
          ))}
          {!dailyReports.data?.length ? (
            <EmptyState
              title="No finalized reports yet"
              description="Reports finalize automatically after the 6 AM boundary once that day's tables are settled or cancelled."
            />
          ) : null}
          {closedReports.length > closedLimit ? (
            <button type="button" className="load-more-button" onClick={() => setClosedLimit((limit) => limit + REPORT_PAGE_SIZE)}>
              Load more reports
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel reports-wide">
        <div className="panel-title">
          <h2>Alcohol stock movements</h2>
          <span>{stockMovements.length} recent</span>
        </div>
        <div className="report-list">
          {stockMovements.slice(0, stockLimit).map((movement) => (
            <article
              key={movement.id}
              className="report-row stock-movement-row"
            >
              <div>
                <strong>{movement.item_name}</strong>
                <span>
                  {alcoholMovementSourceLabel(movement.source_type)} ·{" "}
                  {alcoholMovementDeltaText(movement)}
                </span>
              </div>
              <div>
                <b>
                  {movement.balance_sealed_large} large ·{" "}
                  {movement.balance_open_large_ml} ml ·{" "}
                  {movement.balance_sealed_small} small
                </b>
                <span>
                  {formatPosDateTime(movement.created_at)}
                </span>
              </div>
            </article>
          ))}
          {!alcoholStockMovements.data?.length ? (
            <EmptyState
              title="No alcohol stock history yet"
              description="Stock sales, settlements, manual edits, and negative-stock events will appear here."
            />
          ) : null}
          {stockMovements.length > stockLimit ? (
            <button type="button" className="load-more-button" onClick={() => setStockLimit((limit) => limit + REPORT_PAGE_SIZE)}>
              Load more movements
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReportDetailPanels({ summary }: { summary: CloseSummary | DailyReportDetail }) {
  const [billLimit, setBillLimit] = useState(DETAIL_PAGE_SIZE);
  const [itemLimit, setItemLimit] = useState(DETAIL_PAGE_SIZE);
  const historyReprint = useMutation({
    mutationFn: (billId: string) => hubApi.historyReprintBill(billId, `history-reprint-${billId}-${Date.now()}`)
  });
  const bills = summary.billSummaries ?? [];
  const groups = summary.groupSummaries ?? [];
  const items = summary.itemSummaries ?? [];
  const payments = getPaymentTotals(summary, bills);

  return (
    <div className="report-detail-grid">
      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Payment split</strong>
          <span>{formatInr(payments.total)} collected</span>
        </div>
        <div className="payment-summary-grid">
          <span><small>Cash</small><b>{formatInr(payments.cash)}</b></span>
          <span><small>UPI</small><b>{formatInr(payments.upi)}</b></span>
          <span><small>Card</small><b>{formatInr(payments.card)}</b></span>
          <span><small>Online</small><b>{formatInr(payments.online)}</b></span>
        </div>
      </section>

      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Sale & tax categories</strong>
          <span>{groups.length} categories</span>
        </div>
        <div className="compact-list">
          {groups.map((group) => (
            <div key={group.saleGroupId} className="compact-row">
              <span>{group.name}</span>
              <b>{formatInr(group.finalSalesPaise)}</b>
              <small>{group.quantity} qty · {formatInr(group.taxPaise)} tax</small>
            </div>
          ))}
          {!groups.length ? <p className="plain-state">No category totals yet.</p> : null}
        </div>
      </section>

      <section className="report-detail-card report-detail-wide">
        <div className="mini-title">
          <strong>Order History</strong>
          <span>{bills.length} bills</span>
        </div>
        <div className="compact-list">
          {bills.slice(0, billLimit).map((bill) => (
            <div key={bill.billId} className="compact-row bill-history-row">
              <span>
                Bill #{bill.billNumber ?? bill.billId} · Table {bill.tableName} · {bill.status}
                {bill.revisionNumber ? ` · rev ${bill.revisionNumber}` : ""}
                {bill.isNc ? " · NC" : ""}
              </span>
              <b>{formatInr(bill.finalTotalPaise)}</b>
              <small>
                {bill.items?.length ? `${bill.items.map((item) => `${item.quantity} x ${item.name}`).join(", ")} · ` : ""}
                subtotal {formatInr(bill.subtotalPaise ?? Math.max(0, bill.totalPaise - (bill.taxPaise ?? 0)))} · tax {formatInr(bill.taxPaise ?? 0)} · discount {formatInr(bill.discountPaise)} · tip {formatInr(bill.tipPaise)} ·{" "}
                paid {formatInr(bill.paidPaise)}
                {bill.payments.length ? ` · ${bill.payments.map((payment) => payment.method).join(", ")}` : ""}
                {bill.settledAt ? ` · ${formatPosDateTime(bill.settledAt)}` : ""}
              </small>
              <button
                type="button"
                className="secondary-button compact"
                disabled={historyReprint.isPending}
                onClick={() => historyReprint.mutate(bill.billId)}
              >
                {historyReprint.isPending ? "Printing..." : "Print"}
              </button>
            </div>
          ))}
          {!bills.length ? <p className="plain-state">No bills recorded yet.</p> : null}
          {bills.length > billLimit ? (
            <button type="button" className="load-more-button compact" onClick={() => setBillLimit((limit) => limit + DETAIL_PAGE_SIZE)}>
              Load more bills
            </button>
          ) : null}
        </div>
      </section>

      <section className="report-detail-card report-detail-wide">
        <div className="mini-title">
          <strong>Item summary</strong>
          <span>{items.length} items</span>
        </div>
        <div className="compact-list item-summary-list">
          {items.slice(0, itemLimit).map((item) => (
            <div key={item.menuItemId} className="compact-row">
              <span>{item.name}</span>
              <b>{formatInr(item.grossSalesPaise)}</b>
              <small>{item.quantity} sold · {item.saleGroupName}</small>
            </div>
          ))}
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

function getPaymentTotals(summary: CloseSummary | DailyReportDetail, bills: NonNullable<CloseSummary["billSummaries"]>) {
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
