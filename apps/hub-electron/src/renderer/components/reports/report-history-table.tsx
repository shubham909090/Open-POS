import { type ReactNode } from "react";
import { formatInr, formatPosDateTime, groupPaymentsForDisplay } from "@gaurav-pos/shared";
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
        <strong>Order history</strong>
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
                <th className="numeric-cell">Total</th>
                <th className="numeric-cell">Settlement</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {bills.slice(0, billLimit).map((bill) => (
                <tr key={bill.billId}>
                  <td className="strong-cell">
                    #{bill.billNumber ?? bill.billId}
                    {bill.customerName ? <small className="history-customer-name">{bill.customerName}</small> : null}
                    {bill.modified ? <small className="modified-pill">Modified</small> : bill.revisionNumber ? <small>rev {bill.revisionNumber}</small> : null}
                    {bill.isNc ? <small className="nc-pill">NC</small> : null}
                    {bill.discountPaise > 0 ? <small className="discount-pill">Discount</small> : null}
                  </td>
                  <td>{bill.tableName}</td>
                  <td><span className={`bill-status ${bill.status}`}>{bill.status}</span></td>
                  <td className="wrap-cell history-item-lines">{bill.items?.length ? <details className="history-items-details"><summary>{bill.items.length} item{bill.items.length === 1 ? "" : "s"}</summary>{bill.items.map((item) => <span key={item.orderItemId}>{item.quantity} x {item.name}</span>)}</details> : "No item detail"}</td>
                  <td className="numeric-cell">
                    <div className="history-bill-total">
                      <strong>{formatInr(bill.finalTotalPaise)}</strong>
                      <span className="history-total-line"><span>Subtotal</span><span>{formatInr(bill.subtotalPaise ?? Math.max(0, bill.totalPaise - (bill.taxPaise ?? 0)))}</span></span>
                      <span className="history-total-line"><span>Tax</span><span>{formatInr(bill.taxPaise ?? 0)}</span></span>
                      {bill.discountPaise > 0 ? <span className="history-total-line"><span>Discount</span><span>{formatInr(bill.discountPaise)}</span></span> : null}
                      {bill.tipPaise > 0 ? <span className="history-total-line"><span>Tip</span><span>{formatInr(bill.tipPaise)}</span></span> : null}
                    </div>
                  </td>
                  <td className="numeric-cell"><BillSettlement bill={bill} /></td>
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

function isVoided(bill: HistoryBill): boolean {
  return bill.status === "cancelled" || bill.status === "void";
}

function BillSettlement({ bill }: { bill: HistoryBill }) {
  const payments = groupPaymentsForDisplay(bill.payments);
  const remaining = Math.max(0, bill.finalTotalPaise - bill.paidPaise);
  const singlePayment = payments.length === 1 && payments[0]!.amountPaise === bill.paidPaise;

  return (
    <div className="history-settlement" aria-label={`Settlement for bill ${bill.billNumber ?? bill.billId}`}>
      {bill.isNc ? <span className="history-settlement-note">No charge</span> : isVoided(bill) ? <span className="history-settlement-note">Voided</span> : (
        <>
          <strong>{formatInr(bill.paidPaise)} <small>paid</small></strong>
          {payments.map((payment) => (
            <span key={payment.method} className="history-payment-line">
              <span>{payment.label}</span>
              {!singlePayment ? <span>{formatInr(payment.amountPaise)}</span> : null}
            </span>
          ))}
          {remaining > 0 ? <span className="history-balance-due">{formatInr(remaining)} due</span> : null}
          {bill.finalTotalPaise === 0 && bill.paidPaise === 0 ? <span className="history-settlement-note">No payment due</span> : null}
        </>
      )}
      {bill.settledAt ? <time className="history-settlement-time" dateTime={bill.settledAt}>{formatPosDateTime(bill.settledAt)}</time> : !bill.isNc && !isVoided(bill) ? <span className="history-settlement-note">{bill.status === "paid" ? "Time unavailable" : "Not settled"}</span> : null}
    </div>
  );
}

export { ReportHistoryTable };
export type { HistoryBill };
