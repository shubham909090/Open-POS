import { type ReactNode } from "react";
import { formatInr, formatPosDateTime } from "@gaurav-pos/shared";
import { type CloseSummary } from "../../hub-api.js";

type HistoryBill = NonNullable<CloseSummary["billSummaries"]>[number];

function ReportHistoryTable({
  bills,
  billLimit,
  hasBillSummaries,
  billHistoryPlaceholder,
  reprintPending,
  onLoadMore,
  onPrint,
  onEdit
}: {
  bills: HistoryBill[];
  billLimit: number;
  hasBillSummaries: boolean;
  billHistoryPlaceholder?: ReactNode;
  reprintPending: boolean;
  onLoadMore: () => void;
  onPrint: (billId: string) => void;
  onEdit: (bill: HistoryBill) => void;
}) {
  return (
    <section className="report-detail-card report-history-panel">
      <div className="mini-title">
        <strong>Order History</strong>
        <span>
          showing {Math.min(billLimit, bills.length)} of {bills.length} bills
        </span>
      </div>
      {!hasBillSummaries && billHistoryPlaceholder ? (
        billHistoryPlaceholder
      ) : (
        <div className="report-table-wrap bill-history-list">
          <table className="data-table bill-history-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Breakup</th>
                <th>Settled</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {bills.slice(0, billLimit).map((bill) => (
                <tr key={bill.billId}>
                  <td className="strong-cell">
                    #{bill.billNumber ?? bill.billId}
                    {bill.modified ? <small className="modified-pill">Modified</small> : bill.revisionNumber ? <small>rev {bill.revisionNumber}</small> : null}
                    {bill.isNc ? <small className="nc-pill">NC</small> : null}
                    {bill.discountPaise > 0 ? <small className="discount-pill">Discount</small> : null}
                  </td>
                  <td>{bill.tableName}</td>
                  <td><span className={`bill-status ${bill.status}`}>{bill.status}</span></td>
                  <td className="wrap-cell history-item-lines">{bill.items?.length ? bill.items.map((item) => <span key={item.orderItemId}>{item.quantity} x {item.name}</span>) : "No item detail"}</td>
                  <td>
                    <strong>{formatInr(bill.finalTotalPaise)}</strong>
                    {bill.discountPaise > 0 ? <small className="history-discount-text">Discount {formatInr(bill.discountPaise)}</small> : null}
                  </td>
                  <td>{formatInr(bill.paidPaise)}</td>
                  <td className="wrap-cell">
                    <div className="history-breakup">
                      <span>Subtotal {formatInr(bill.subtotalPaise ?? Math.max(0, bill.totalPaise - (bill.taxPaise ?? 0)))}</span>
                      <span>Tax {formatInr(bill.taxPaise ?? 0)}</span>
                      <span>Discount {formatInr(bill.discountPaise)}</span>
                      <span>Tip {formatInr(bill.tipPaise)}</span>
                      {bill.payments.length ? <span>{bill.payments.map((payment) => payment.method).join(", ")}</span> : null}
                    </div>
                  </td>
                  <td>{bill.settledAt ? formatPosDateTime(bill.settledAt) : "Not settled"}</td>
                  <td className="action-cell">
                    <div className="history-actions">
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={reprintPending}
                        onClick={() => onPrint(bill.billId)}
                      >
                        {reprintPending ? "Printing..." : "Print"}
                      </button>
                      {bill.status === "paid" || bill.isNc ? (
                        <button type="button" className="secondary-button compact" onClick={() => onEdit(bill)}>
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!bills.length ? <p className="plain-state">No bills recorded yet.</p> : null}
          {bills.length > billLimit ? (
            <button type="button" className="load-more-button compact" onClick={onLoadMore}>
              Load more bills
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export { ReportHistoryTable };
export type { HistoryBill };
