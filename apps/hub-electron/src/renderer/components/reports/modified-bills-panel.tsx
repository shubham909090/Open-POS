import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, RefreshCcw, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInr, formatPosDateTime } from "@gaurav-pos/shared";
import { hubApi, type ModifiedBillAuditChange, type ModifiedBillAuditRow } from "../../hub-api.js";
import type { ManagerApproval, ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { EmptyState } from "../ui/empty-state.js";
import { Metric } from "../ui/metric.js";

const MONEY_CHANGE_KINDS = new Set<ModifiedBillAuditChange["kind"]>([
  "item_price",
  "payment_added",
  "payment_removed",
  "payment_changed",
  "discount",
  "tip",
  "final_total"
]);

type ModifiedBillRequest = {
  from: string;
  to: string;
  exactSearch?: string;
};

export function ModifiedBillsPanel({
  currentBusinessDate,
  masterPinConfigured,
  requestManagerApproval
}: {
  currentBusinessDate: string;
  masterPinConfigured: boolean;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const previousBusinessDate = useRef(currentBusinessDate);
  const [approval, setApproval] = useState<ManagerApproval | null>(null);
  const [from, setFrom] = useState(currentBusinessDate);
  const [to, setTo] = useState(currentBusinessDate);
  const [exactSearch, setExactSearch] = useState("");
  const [request, setRequest] = useState<ModifiedBillRequest>({ from: currentBusinessDate, to: currentBusinessDate });
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const clearModifiedBillQueries = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: ["modifiedBills"] });
    queryClient.removeQueries({ queryKey: ["modifiedBills"] });
  }, [queryClient]);

  useEffect(() => clearModifiedBillQueries, [clearModifiedBillQueries]);

  useEffect(() => {
    const previous = previousBusinessDate.current;
    setFrom((current) => (!current || current === previous ? currentBusinessDate : current));
    setTo((current) => (!current || current === previous ? currentBusinessDate : current));
    setRequest((current) => ({
      from: !current.from || current.from === previous ? currentBusinessDate : current.from,
      to: !current.to || current.to === previous ? currentBusinessDate : current.to,
      exactSearch: current.exactSearch
    }));
    previousBusinessDate.current = currentBusinessDate;
  }, [currentBusinessDate]);

  const modifiedBills = useQuery({
    queryKey: ["modifiedBills", request.from, request.to, request.exactSearch ?? ""],
    queryFn: () => hubApi.modifiedBills({ ...request, masterApproval: approval as ManagerApproval }),
    enabled: Boolean(approval)
  });

  const rows = modifiedBills.isSuccess && !modifiedBills.isFetching ? modifiedBills.data?.rows ?? [] : [];
  const finalDelta = useMemo(() => rows.reduce((total, row) => total + row.after.finalTotalPaise - row.before.finalTotalPaise, 0), [rows]);
  const dateInvalid = !from || !to || from > to;

  const unlock = async () => {
    try {
      const nextApproval = await requestManagerApproval({
        title: "Open modified bills audit",
        defaultReason: "View modified bills",
        pinLabel: "Master PIN",
        approvedBy: "owner",
        confirmLabel: "Open audit"
      });
      setApproval(nextApproval);
      setRequest(requestFromControls(from, to, exactSearch));
    } catch {
      return;
    }
  };

  if (!masterPinConfigured) {
    return (
      <section className="panel reports-wide modified-bills-panel">
        <div className="panel-title">
          <h2>Modified Bills</h2>
          <span>Master PIN required</span>
        </div>
        <EmptyState title="Create Master PIN first" description="Modified bill audit is owner-only." />
      </section>
    );
  }

  if (!approval) {
    return (
      <section className="panel reports-wide modified-bills-panel">
        <div className="panel-title">
          <h2>Modified Bills</h2>
          <span>Owner audit</span>
        </div>
        <div className="modified-bill-unlock">
          <div>
            <strong>Master PIN required</strong>
            <span>Audit opens only after owner approval.</span>
          </div>
          <button type="button" className="secondary-button" onClick={() => void unlock()}>
            <LockKeyhole size={16} />
            <span>Open audit</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="report-panel-modified" role="tabpanel" aria-labelledby="report-tab-modified" className="panel reports-wide modified-bills-panel">
      <div className="panel-title">
        <h2>Modified Bills</h2>
        <button
          type="button"
          className="secondary-button compact"
          onClick={() => {
            clearModifiedBillQueries();
            setApproval(null);
            setExpandedAuditId(null);
          }}
        >
          <LockKeyhole size={14} />
          <span>Lock</span>
        </button>
      </div>

      <form
        className="modified-bills-controls"
        onSubmit={(event) => {
          event.preventDefault();
          if (dateInvalid) return;
          setExpandedAuditId(null);
          setRequest(requestFromControls(from, to, exactSearch));
        }}
      >
        <label>
          From
          <input type="date" value={from} max={currentBusinessDate} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} max={currentBusinessDate} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Exact search
          <input value={exactSearch} onChange={(event) => setExactSearch(event.target.value)} placeholder="Bill number, bill ID, order ID" />
        </label>
        <button type="submit" className="secondary-button" disabled={dateInvalid || modifiedBills.isFetching}>
          <Search size={16} />
          <span>{modifiedBills.isFetching ? "Searching..." : "Search"}</span>
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={modifiedBills.isFetching}
          onClick={() => {
            setFrom(currentBusinessDate);
            setTo(currentBusinessDate);
            setExactSearch("");
            setExpandedAuditId(null);
            setRequest({ from: currentBusinessDate, to: currentBusinessDate });
          }}
        >
          <RefreshCcw size={16} />
          <span>Today</span>
        </button>
      </form>
      {dateInvalid ? <p className="warning-text">Choose a valid date range.</p> : null}
      {modifiedBills.error ? <p className="warning-text">{modifiedBills.error instanceof Error ? modifiedBills.error.message : "Modified bills could not load."}</p> : null}

      <div className="report-metrics modified-bill-metrics">
        <Metric label="Modified bills" value={String(rows.length)} className="report-metric bills" />
        <Metric label="Net change" value={formatSignedInr(finalDelta)} className="report-metric sales" />
      </div>

      <div className="report-table-wrap">
        <table className="data-table modified-bills-table">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Table</th>
              <th>Changed by</th>
              <th>Approval</th>
              <th>Change</th>
              <th>Reason</th>
              <th>Time</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="strong-cell">
                    #{row.billNumber}
                    <small>rev {row.fromRevisionNumber} - {row.toRevisionNumber}</small>
                    <small>{row.billId}</small>
                    <small>{row.orderId}</small>
                  </td>
                  <td>{row.tableName}</td>
                  <td className="wrap-cell">
                    <strong>{row.actor.name}</strong>
                    <span className="audit-subtext">{row.actor.role} · {row.actor.deviceId}</span>
                  </td>
                  <td className="wrap-cell">
                    <strong>{approvalLabel(row)}</strong>
                    <span className="audit-subtext">{row.approvedBy}</span>
                  </td>
                  <td>
                    <strong>{formatSignedInr(row.after.finalTotalPaise - row.before.finalTotalPaise)}</strong>
                    <span className="audit-subtext">{changeTypeLabel(row.changeType)}</span>
                  </td>
                  <td className="wrap-cell">{row.reason}</td>
                  <td>{formatPosDateTime(row.createdAt)}</td>
                  <td className="action-cell">
                    <button type="button" className="secondary-button compact" onClick={() => setExpandedAuditId((current) => current === row.id ? null : row.id)}>
                      {expandedAuditId === row.id ? "Hide" : "Open"}
                    </button>
                  </td>
                </tr>
                {expandedAuditId === row.id ? (
                  <tr>
                    <td colSpan={8} className="report-table-detail">
                      <ModifiedBillAuditDetail row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!modifiedBills.isLoading && rows.length === 0 ? <EmptyState title="No audited bill modifications" description="Try another date range or exact bill search." /> : null}
        {modifiedBills.isLoading ? <p className="plain-state">Loading modified bills...</p> : null}
      </div>
    </section>
  );
}

function ModifiedBillAuditDetail({ row }: { row: ModifiedBillAuditRow }) {
  return (
    <div className="modified-bill-detail-grid">
      <section>
        <div className="mini-title">
          <strong>Changes</strong>
          <span>Bill {row.billId} · Order {row.orderId}</span>
        </div>
        <p className="audit-subtext">{row.changes.length} tracked changes</p>
        <div className="modified-change-list">
          {row.changes.map((change, index) => (
            <div key={`${change.kind}-${change.label}-${index}`} className="modified-change-row">
              <strong>{change.label}</strong>
              <span>{formatChangeValue(change, change.before)}{" -> "}{formatChangeValue(change, change.after)}</span>
            </div>
          ))}
          {!row.changes.length ? <p className="plain-state">Revision saved without visible amount or item change.</p> : null}
        </div>
      </section>
      <SnapshotPanel title="Before" row={row} side="before" />
      <SnapshotPanel title="After" row={row} side="after" />
    </div>
  );
}

function SnapshotPanel({ title, row, side }: { title: string; row: ModifiedBillAuditRow; side: "before" | "after" }) {
  const snapshot = row[side];
  return (
    <section className="modified-snapshot-panel">
      <div className="mini-title">
        <strong>{title}</strong>
        <span>{formatInr(snapshot.finalTotalPaise)}</span>
      </div>
      <div className="modified-snapshot-lines">
        {snapshot.items.map((item) => (
          <span key={item.orderItemId}>{item.quantity} x {item.name} · {formatInr(item.lineTotalPaise)}</span>
        ))}
        {!snapshot.items.length ? <span>No items</span> : null}
      </div>
      <div className="modified-payment-lines">
        {snapshot.payments.map((payment, index) => (
          <span key={`${payment.method}-${payment.reference ?? ""}-${index}`}>{payment.method}: {formatInr(payment.amountPaise)}</span>
        ))}
        {!snapshot.payments.length ? <span>No payments</span> : null}
      </div>
    </section>
  );
}

function requestFromControls(from: string, to: string, exactSearch: string): ModifiedBillRequest {
  const trimmedSearch = exactSearch.trim();
  return { from, to, ...(trimmedSearch ? { exactSearch: trimmedSearch } : {}) };
}

function changeTypeLabel(value: ModifiedBillAuditRow["changeType"]): string {
  return value === "history_edit" ? "History edit" : "Pending bill revision";
}

function approvalLabel(row: ModifiedBillAuditRow): string {
  return row.approvalType === "master" ? "Master PIN" : "Manager PIN";
}

function formatSignedInr(value: number): string {
  if (value === 0) return formatInr(0);
  return `${value > 0 ? "+" : "-"}${formatInr(Math.abs(value))}`;
}

function formatChangeValue(change: ModifiedBillAuditChange, value: string): string {
  const numeric = Number(value);
  if (MONEY_CHANGE_KINDS.has(change.kind) && Number.isFinite(numeric)) return formatInr(numeric);
  return value;
}
