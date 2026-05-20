import { humanPayments, money } from "../../lib/cloud-format";
import { EmptyState, Metric } from "../cloud-admin-widgets";

export function ReportsSection({
  reports,
  selectedDate,
  onSelectDate,
  detail
}: {
  reports: Array<{
    businessDate: string;
    billCount: number;
    grossSalesPaise: number;
    discountPaise: number;
    tipPaise: number;
    finalSalesPaise: number;
    totalPaymentsPaise: number;
    finalizedAt: string;
  }>;
  selectedDate: string;
  onSelectDate: (value: string) => void;
  detail:
    | {
        report: {
          businessDate: string;
          grossSalesPaise: number;
          discountPaise: number;
          tipPaise: number;
          finalSalesPaise: number;
          cashPaymentsPaise: number;
          upiPaymentsPaise: number;
          cardPaymentsPaise: number;
          onlinePaymentsPaise: number;
          totalPaymentsPaise: number;
          billCount: number;
          paidBills: number;
          cancelledOrders: number;
          finalizedAt: string;
        };
        bills: Array<{
          billId: string;
          tableName: string;
          finalTotalPaise: number;
          paidPaise: number;
          paymentsJson: string;
          status: string;
        }>;
        items: Array<{
          menuItemId: string;
          name: string;
          saleGroupName?: string;
          quantity: number;
          grossSalesPaise: number;
          ncQuantity?: number;
          ncGrossSalesPaise?: number;
        }>;
        groups: Array<{
          saleGroupId: string;
          name: string;
          kind: string;
          quantity: number;
          grossSalesPaise: number;
          taxPaise: number;
          finalSalesPaise: number;
          ncQuantity: number;
          ncGrossSalesPaise: number;
        }>;
      }
    | null
    | undefined;
}) {
  if (!reports.length) {
    return (
      <section className="admin-panel">
        <span className="eyebrow">Reports</span>
        <h2>No finalized reports yet</h2>
        <p>The hub finalizes each business day after the 6 AM IST boundary once old tables are settled or cancelled. Synced reports will appear here.</p>
      </section>
    );
  }

  const report = detail?.report;
  return (
    <div className="cloud-report-layout">
      <section className="admin-panel">
        <span className="eyebrow">Reports</span>
        <h2>Finalized business days</h2>
        <label className="field-label date-picker">
          Business date
          <select value={selectedDate} onChange={(event) => onSelectDate(event.target.value)}>
            {reports.map((row) => (
              <option key={row.businessDate} value={row.businessDate}>
                {row.businessDate}
              </option>
            ))}
          </select>
        </label>
        <div className="stack-list">
          {reports.map((row) => (
            <button
              key={row.businessDate}
              type="button"
              className={row.businessDate === selectedDate ? "report-select active" : "report-select"}
              onClick={() => onSelectDate(row.businessDate)}
            >
              <strong>{row.businessDate}</strong>
              <span>{row.billCount} bills · {money(row.finalSalesPaise)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel wide-panel">
        {report ? (
          <>
            <span className="eyebrow">Day report</span>
            <h2>{report.businessDate}</h2>
            <div className="report-metric-grid">
              <Metric label="Final sales" value={money(report.finalSalesPaise)} />
              <Metric label="Gross sales" value={money(report.grossSalesPaise)} />
              <Metric label="Discounts" value={money(report.discountPaise)} />
              <Metric label="Tips" value={money(report.tipPaise)} />
              <Metric label="Cash" value={money(report.cashPaymentsPaise)} />
              <Metric label="UPI" value={money(report.upiPaymentsPaise)} />
              <Metric label="Card" value={money(report.cardPaymentsPaise)} />
              <Metric label="Online" value={money(report.onlinePaymentsPaise)} />
              <Metric label="Bills" value={String(report.billCount)} />
            </div>

            <div className="report-detail-grid">
              <section>
                <h3>Groups</h3>
                <div className="stack-list">
                  {(detail.groups ?? []).map((group) => (
                    <article key={group.saleGroupId} className="list-row split-row">
                      <div>
                        <strong>{group.name}</strong>
                        <span>{group.quantity} sold · tax {money(group.taxPaise)}{group.ncQuantity ? ` · NC ${group.ncQuantity}` : ""}</span>
                      </div>
                      <strong>{money(group.finalSalesPaise)}</strong>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>Bills</h3>
                <div className="stack-list">
                  {detail.bills.map((bill) => (
                    <article key={bill.billId} className="list-row split-row">
                      <div>
                        <strong>{bill.tableName}</strong>
                        <span>{bill.status} · paid {money(bill.paidPaise)}</span>
                        <details className="advanced-json">
                          <summary>Payment details</summary>
                          <code>{humanPayments(bill.paymentsJson)}</code>
                        </details>
                      </div>
                      <strong>{money(bill.finalTotalPaise)}</strong>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>Items</h3>
                <div className="stack-list">
                  {detail.items.map((item) => (
                    <article key={item.menuItemId} className="list-row split-row">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.quantity} sold{item.saleGroupName ? ` · ${item.saleGroupName}` : ""}{item.ncQuantity ? ` · NC ${item.ncQuantity}` : ""}</span>
                      </div>
                      <strong>{money(item.grossSalesPaise)}</strong>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <EmptyState title="Report loading" text="Choose a finalized business day to see sales, payments, bills, and item totals." />
        )}
      </section>
    </div>
  );
}
