import { Fragment, type KeyboardEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type RangeReportDetail } from "../../hub-api.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { alcoholMovementSourceLabel, alcoholMovementDeltaText } from "../../lib/format.js";
import { EmptyState } from "../ui/empty-state.js";
import { Metric } from "../ui/metric.js";
import { BackupPanel } from "./backup-panel.js";
import { RangeReportExports } from "./range-report-exports.js";
import { ReportDetailPanels } from "./report-detail-panels.js";

const REPORT_PAGE_SIZE = 8;
const REPORT_TABS = ["daily", "range", "backups"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

export function ReportsView({ requestManagerApproval }: { requestManagerApproval: ManagerApprovalRequest }) {
  const queryClient = useQueryClient();
  const [reportTab, setReportTab] = useState<ReportTab>("daily");
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [closedLimit, setClosedLimit] = useState(REPORT_PAGE_SIZE);
  const [stockLimit, setStockLimit] = useState(REPORT_PAGE_SIZE);
  const initialRangeTo = previousBusinessDate(new Date().toISOString().slice(0, 10));
  const [rangeFrom, setRangeFrom] = useState(monthStart(initialRangeTo));
  const [rangeTo, setRangeTo] = useState(initialRangeTo);
  const [rangeTouched, setRangeTouched] = useState(false);
  const [rangeRequest, setRangeRequest] = useState({ from: monthStart(initialRangeTo), to: initialRangeTo, includeBills: false });
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
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: hubApi.bootstrap,
  });
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: hubApi.backups,
    enabled: reportTab === "backups",
  });
  const pendingRestore = useQuery({
    queryKey: ["pendingRestore"],
    queryFn: hubApi.pendingRestore,
    enabled: reportTab === "backups",
  });
  const dailyReportDetail = useQuery({
    queryKey: ["dailyReport", expandedReportId],
    queryFn: () => hubApi.dailyReport(expandedReportId ?? ""),
    enabled: Boolean(expandedReportId),
  });
  const summary = currentSummary.data;
  const closedReports = dailyReports.data ?? [];
  const stockMovements = alcoholStockMovements.data ?? [];
  const latestClosedDate = closedReports[0]?.business_date;
  const defaultRangeTo = latestClosedDate ?? previousBusinessDate(summary?.businessDay.business_date ?? new Date().toISOString().slice(0, 10));
  const defaultRangeFrom = monthStart(defaultRangeTo);
  const maxRangeDate = defaultRangeTo;
  useEffect(() => {
    if (rangeTouched) return;
    setRangeFrom(defaultRangeFrom);
    setRangeTo(defaultRangeTo);
    setRangeRequest({ from: defaultRangeFrom, to: defaultRangeTo, includeBills: false });
  }, [defaultRangeFrom, defaultRangeTo, rangeTouched]);
  const rangeReport = useQuery({
    queryKey: ["rangeReport", rangeRequest.from, rangeRequest.to, rangeRequest.includeBills],
    queryFn: () => hubApi.rangeReport(rangeRequest.from, rangeRequest.to, rangeRequest.includeBills),
    enabled: reportTab === "range" && Boolean(rangeRequest.from && rangeRequest.to)
  });
  const selectReportTab = (nextTab: ReportTab) => setReportTab(nextTab);
  const handleReportTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = REPORT_TABS.indexOf(reportTab);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? REPORT_TABS.length - 1
          : event.key === "ArrowLeft"
            ? Math.max(0, currentIndex - 1)
            : Math.min(REPORT_TABS.length - 1, currentIndex + 1);
    const nextTab = REPORT_TABS[nextIndex] ?? reportTab;
    selectReportTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`report-tab-${nextTab}`)?.focus());
  };
  const refreshBackups = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["backups"] }),
      queryClient.invalidateQueries({ queryKey: ["pendingRestore"] }),
    ]);
  };
  return (
    <div className="reports-layout">
      <section className="panel reports-wide">
        <div className="panel-title">
          <h2>Reports</h2>
          <div className="report-tabs" role="tablist" aria-label="Report views" onKeyDown={handleReportTabKeyDown}>
            <button
              id="report-tab-daily"
              type="button"
              role="tab"
              aria-selected={reportTab === "daily"}
              aria-controls="report-panel-daily"
              tabIndex={reportTab === "daily" ? 0 : -1}
              className={reportTab === "daily" ? "active" : ""}
              onClick={() => selectReportTab("daily")}
            >
              Daily
            </button>
            <button
              id="report-tab-range"
              type="button"
              role="tab"
              aria-selected={reportTab === "range"}
              aria-controls="report-panel-range"
              tabIndex={reportTab === "range" ? 0 : -1}
              className={reportTab === "range" ? "active" : ""}
              onClick={() => selectReportTab("range")}
            >
              Monthly / Range
            </button>
            <button
              id="report-tab-backups"
              type="button"
              role="tab"
              aria-selected={reportTab === "backups"}
              aria-controls="report-panel-backups"
              tabIndex={reportTab === "backups" ? 0 : -1}
              className={reportTab === "backups" ? "active" : ""}
              onClick={() => selectReportTab("backups")}
            >
              Backups
            </button>
          </div>
        </div>
      </section>

      {reportTab === "daily" ? (
        <div id="report-panel-daily" role="tabpanel" aria-labelledby="report-tab-daily" className="reports-tab-panel">
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
                className="report-metric sales"
              />
              <Metric
                label="Cash"
                value={formatInr(summary.cashPaymentsPaise)}
                className="report-metric cash"
              />
              <Metric
                label="Non-cash"
                value={formatInr(summary.nonCashPaymentsPaise)}
                className="report-metric noncash"
              />
              <Metric label="Bills" value={String(summary.billCount)} className="report-metric bills" />
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
        <div className="report-table-wrap">
          <table className="data-table closed-report-table">
            <thead>
              <tr>
                <th>Business day</th>
                <th>Bills</th>
                <th>Sales</th>
                <th>Payments</th>
                <th>Finalized</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {closedReports.slice(0, closedLimit).map((report) => (
                <Fragment key={report.pos_day_id}>
                  <tr>
                    <td className="strong-cell">{report.business_date}</td>
                    <td>{report.bill_count}</td>
                    <td>{formatInr(report.final_sales_paise)}</td>
                    <td>{formatInr(report.total_payments_paise)}</td>
                    <td>{formatPosDateTime(report.finalized_at)}</td>
                    <td className="action-cell">
                      <button
                        type="button"
                        className="secondary-button compact"
                        onClick={() => setExpandedReportId(expandedReportId === report.pos_day_id ? null : report.pos_day_id)}
                      >
                        {expandedReportId === report.pos_day_id ? "Hide" : "Open"}
                      </button>
                    </td>
                  </tr>
                  {expandedReportId === report.pos_day_id ? (
                    <tr>
                      <td colSpan={6} className="report-table-detail">
                        {dailyReportDetail.isLoading ? (
                          <p className="plain-state">Loading report...</p>
                        ) : dailyReportDetail.data ? (
                          <ReportDetailPanels summary={dailyReportDetail.data} />
                        ) : (
                          <p className="warning-text">Report detail could not load.</p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
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
        </div>
      ) : null}

      {reportTab === "range" ? (
        <section id="report-panel-range" role="tabpanel" aria-labelledby="report-tab-range" className="panel reports-wide">
          <div className="panel-title">
            <h2>Monthly / date range</h2>
            <span>Finalized business days only</span>
          </div>
          <form
            className="range-report-controls"
            onSubmit={(event) => {
              event.preventDefault();
              setRangeTouched(true);
              setRangeRequest({ from: rangeFrom, to: rangeTo, includeBills: false });
            }}
          >
            <label>
              From
              <input type="date" value={rangeFrom} max={maxRangeDate} onChange={(event) => { setRangeTouched(true); setRangeFrom(event.target.value); }} />
            </label>
            <label>
              To
              <input type="date" value={rangeTo} max={maxRangeDate} onChange={(event) => { setRangeTouched(true); setRangeTo(event.target.value); }} />
            </label>
            <button type="submit" className="secondary-button" disabled={rangeReport.isFetching}>
              {rangeReport.isFetching ? "Loading..." : "Apply"}
            </button>
          </form>
          {rangeReport.error ? <p className="warning-text">{rangeReport.error instanceof Error ? rangeReport.error.message : "Range report could not load."}</p> : null}
          {rangeReport.data ? (
            <RangeReportSummary
              report={rangeReport.data}
              billHistoryLoading={rangeReport.isFetching && rangeRequest.includeBills}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              rangeRequest={rangeRequest}
              rangeIsFetching={rangeReport.isFetching}
              onLoadBills={() => setRangeRequest((current) => ({ ...current, includeBills: true }))}
            />
          ) : rangeReport.isLoading ? (
            <EmptyState title="Range report loading" description="The hub is reading finalized daily report snapshots." />
          ) : null}
        </section>
      ) : null}

      {reportTab === "backups" ? (
        <div id="report-panel-backups" role="tabpanel" aria-labelledby="report-tab-backups" className="reports-tab-panel">
          <BackupPanel
            backups={backups.data ?? []}
            loading={backups.isLoading}
            pendingRestore={pendingRestore.data ?? null}
            pendingLoading={pendingRestore.isLoading}
            masterPinConfigured={Boolean(bootstrap.data?.setup?.masterPinConfigured)}
            requestManagerApproval={requestManagerApproval}
            onChanged={refreshBackups}
          />
        </div>
      ) : null}

      {reportTab === "daily" ? (
      <section className="panel reports-wide">
        <div className="panel-title">
          <h2>Alcohol stock movements</h2>
          <span>{stockMovements.length} recent</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table stock-movement-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Source</th>
                <th>Movement</th>
                <th>Large</th>
                <th>Open ml</th>
                <th>Small</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {stockMovements.slice(0, stockLimit).map((movement) => (
                <tr key={movement.id}>
                  <td className="strong-cell">{movement.item_name}</td>
                  <td>{alcoholMovementSourceLabel(movement.source_type)}</td>
                  <td>{alcoholMovementDeltaText(movement)}</td>
                  <td>{movement.balance_sealed_large}</td>
                  <td>{movement.balance_open_large_ml}</td>
                  <td>{movement.balance_sealed_small}</td>
                  <td>{formatPosDateTime(movement.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
      ) : null}
    </div>
  );
}

function RangeReportSummary({
  report,
  billHistoryLoading,
  rangeFrom,
  rangeTo,
  rangeRequest,
  rangeIsFetching,
  onLoadBills,
}: {
  report: RangeReportDetail;
  billHistoryLoading: boolean;
  rangeFrom: string;
  rangeTo: string;
  rangeRequest: { from: string; to: string };
  rangeIsFetching: boolean;
  onLoadBills: () => void;
}) {
  const hasWarnings = report.missingDates.length > 0 || report.unfinalizedDates.length > 0;
  return (
    <div className="range-report-result">
      <div className="report-metrics">
        <Metric label="Sales" value={formatInr(report.finalSalesPaise)} className="report-metric sales" />
        <Metric label="Cash" value={formatInr(report.cashPaymentsPaise)} className="report-metric cash" />
        <Metric label="UPI" value={formatInr(report.upiPaymentsPaise)} className="report-metric noncash" />
        <Metric label="Card" value={formatInr(report.cardPaymentsPaise)} className="report-metric noncash" />
        <Metric label="Online" value={formatInr(report.onlinePaymentsPaise)} className="report-metric noncash" />
        <Metric label="Bills" value={String(report.billCount)} className="report-metric bills" />
      </div>
      {hasWarnings ? (
        <div className="range-warning" role="status">
          <strong>Some selected dates have no finalized report.</strong>
          {report.unfinalizedDates.length ? <span>Unfinalized: {report.unfinalizedDates.join(", ")}</span> : null}
          {report.missingDates.length ? <span>Missing: {report.missingDates.join(", ")}</span> : null}
        </div>
      ) : null}
      <RangeReportExports report={report} rangeFrom={rangeFrom} rangeTo={rangeTo} rangeRequest={rangeRequest} rangeIsFetching={rangeIsFetching} />
      <section className="report-detail-card">
        <div className="mini-title">
          <strong>Daily breakdown</strong>
          <span>{report.availableDays.length} finalized days</span>
        </div>
        <div className="report-table-wrap">
          <table className="data-table range-daily-table">
            <thead>
              <tr>
                <th>Business day</th>
                <th>Bills</th>
                <th>Sales</th>
                <th>Cash</th>
                <th>UPI</th>
                <th>Card</th>
                <th>Online</th>
                <th>Finalized</th>
              </tr>
            </thead>
            <tbody>
              {report.availableDays.map((day) => (
                <tr key={day.pos_day_id}>
                  <td className="strong-cell">{day.business_date}</td>
                  <td>{day.bill_count}</td>
                  <td>{formatInr(day.final_sales_paise)}</td>
                  <td>{formatInr(day.cash_payments_paise)}</td>
                  <td>{formatInr(day.upi_payments_paise)}</td>
                  <td>{formatInr(day.card_payments_paise)}</td>
                  <td>{formatInr(day.online_payments_paise)}</td>
                  <td>{formatPosDateTime(day.finalized_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.availableDays.length ? <EmptyState title="No finalized days in this range" description="Pick dates that already have closed daily reports." /> : null}
        </div>
      </section>
      <ReportDetailPanels
        summary={report}
        billHistoryPlaceholder={
          <div className="range-bill-placeholder">
            <strong>Bill history is collapsed for performance.</strong>
            <span>Load it only when you need bill-by-bill checking for this range.</span>
            <button type="button" className="secondary-button compact" onClick={onLoadBills} disabled={billHistoryLoading}>
              {billHistoryLoading ? "Loading bills..." : "Load bill history"}
            </button>
          </div>
        }
      />
    </div>
  );
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function previousBusinessDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}
