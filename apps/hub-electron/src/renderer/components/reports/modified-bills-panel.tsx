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
          <h2>Modified bills</h2>
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
          <h2>Modified bills</h2>
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
        <h2>Modified bills</h2>
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
              <th className="numeric-cell">Change</th>
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
                    <small>rev {row.fromRevisionNumber} → {row.toRevisionNumber}</small>
                  </td>
                  <td>{row.tableName}</td>
                  <td className="wrap-cell">
                    <strong>{row.actor.name}</strong>
                    <span className="audit-subtext" title={row.actor.deviceId}>{row.actor.role}</span>
                  </td>
                  <td className="wrap-cell">
                    <strong>{approvalLabel(row)}</strong>
                    <span className="audit-subtext">{row.approvedBy}</span>
                  </td>
                  <td className="numeric-cell audit-money-cell">
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
  const itemIds = [...new Set([...row.before.items, ...row.after.items].map((item) => item.orderItemId))];
  const paymentKeys = [...new Set([...row.before.payments, ...row.after.payments].map((payment) => `${payment.method}\n${payment.reference ?? ""}`))].sort();
  const receiptRows = [
    { label: "Bill name", before: row.before.customerName || "None", after: row.after.customerName || "None" },
    ...itemIds.map((id) => {
      const before = row.before.items.find((item) => item.orderItemId === id);
      const after = row.after.items.find((item) => item.orderItemId === id);
      const describe = (item: typeof before) => item ? `${item.quantity} × ${item.name} · ${formatInr(item.lineTotalPaise)}` : "—";
      return { label: after?.name ?? before?.name ?? "Item", before: describe(before), after: describe(after) };
    }),
    ...paymentKeys.map((key) => {
      const [method = "", reference = ""] = key.split("\n");
      const amount = (side: "before" | "after") => row[side].payments.filter((payment) => payment.method === method && (payment.reference ?? "") === reference).reduce((sum, payment) => sum + payment.amountPaise, 0);
      return { label: `${paymentLabel(method)}${reference ? ` · ${reference}` : ""}`, before: formatInr(amount("before")), after: formatInr(amount("after")) };
    }),
    ...([ ["Subtotal", "subtotalPaise"], ["Tax", "taxPaise"], ["Discount", "discountPaise"], ["Tip", "tipPaise"], ["Final total", "finalTotalPaise"] ] as const).map(([label, key]) => ({ label, before: formatInr(row.before[key]), after: formatInr(row.after[key]) }))
  ];
  return <div className="modified-bill-detail">
    <div className="mini-title"><strong>Changes · revision {row.fromRevisionNumber} → {row.toRevisionNumber}</strong><span>{row.changes.length} tracked changes</span></div>
    <table className="audit-diff-table">
      <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
      <tbody>{row.changes.map((change, index) => <tr key={`${change.kind}-${index}`}>
        <th scope="row">{paymentLabel(change.label)}</th>
        <td>{formatChangeValue(change, change.before)}</td>
        <td className="changed-value">{formatChangeValue(change, change.after)}</td>
      </tr>)}</tbody>
    </table>
    {!row.changes.length ? <p className="plain-state">Revision saved without visible amount or item change.</p> : null}
    <details className="audit-full-receipt"><summary>Full receipt comparison</summary>
      <table className="audit-diff-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
        <tbody>{receiptRows.map((entry, index) => <tr key={index}><th scope="row">{entry.label}</th><td>{entry.before}</td><td className={entry.before !== entry.after ? "changed-value" : ""}>{entry.after}</td></tr>)}</tbody>
      </table>
    </details>
    <footer className="audit-identifiers"><span>Bill ID <code>{row.billId}</code></span><span>Order ID <code>{row.orderId}</code></span></footer>
  </div>;
}

function paymentLabel(value: string): string {
  return value.replace(/\b(cash|upi|card|online)\b/gi, (method) => method.toLowerCase() === "upi" ? "UPI" : method[0]!.toUpperCase() + method.slice(1).toLowerCase());
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
  return paymentLabel(value);
}
